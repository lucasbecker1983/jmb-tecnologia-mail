import { getEmailAddress, parseEmailAddressParts } from "@/lib/email/address";
import type { OutboundProviderMessage } from "@/lib/email/outbound-provider-types";

// JMB fork: Maileroo is a secrets-configured fallback for Resend. Sending keys are per domain
// (MAILEROO_SENDING_KEYS = {"domain.com":"key"}), with MAILEROO_API_KEY as an account-wide default.

export const MAILEROO_SEND_URL = "https://smtp.maileroo.com/api/v2/emails";
const MAX_HEADER_VALUE = 768;
// Maileroo does not preserve a custom Message-ID, so never send one.
const DROPPED_HEADERS = new Set(["message-id"]);

type MailerooEnv = { MAILEROO_API_KEY?: string; MAILEROO_SENDING_KEYS?: string };
type EmailObject = { address: string; display_name?: string };

/** An HTTP failure from a mail provider, keeping the status so callers can decide on a fallback. */
export class ProviderHttpError extends Error {
	constructor(message: string, readonly status: number) {
		super(message);
		this.name = "ProviderHttpError";
	}
}

/** Resend definitively did not accept the message: quota/rate limit, rejected key, or its own outage. */
export function isFallbackStatus(status: number): boolean {
	return status === 429 || status === 401 || status === 403 || status >= 500;
}

export function getMailerooKey(env: unknown, fromAddress: string): string | null {
	const values = env as MailerooEnv;
	const domain = getEmailAddress(fromAddress).split("@")[1]?.toLowerCase() ?? "";
	const raw = values.MAILEROO_SENDING_KEYS?.trim();
	if (raw && domain) {
		try {
			const keys = JSON.parse(raw) as Record<string, unknown>;
			const key = keys[domain];
			if (typeof key === "string" && key.trim()) return key.trim();
		} catch {
			console.warn("MAILEROO_SENDING_KEYS is not valid JSON");
		}
	}
	return values.MAILEROO_API_KEY?.trim() || null;
}

function emailObject(value: string): EmailObject {
	const { address, name } = parseEmailAddressParts(value);
	return name ? { address, display_name: name } : { address };
}

/** Keeps the newest references when the header is longer than Maileroo accepts. */
function fitHeader(name: string, value: string): string {
	if (value.length <= MAX_HEADER_VALUE) return value;
	if (name.toLowerCase() === "references") {
		const ids = value.split(/\s+/).filter(Boolean);
		while (ids.length > 1 && ids.join(" ").length > MAX_HEADER_VALUE) ids.splice(ids.length > 2 ? 1 : 0, 1);
		return ids.join(" ").slice(0, MAX_HEADER_VALUE);
	}
	return value.slice(0, MAX_HEADER_VALUE);
}

function toBase64(buffer: ArrayBuffer): string {
	const bytes = new Uint8Array(buffer);
	let binary = "";
	for (let offset = 0; offset < bytes.length; offset += 0x8000) {
		binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
	}
	return btoa(binary);
}

export function mailerooPayload(message: OutboundProviderMessage) {
	const headers = Object.fromEntries(Object.entries(message.headers ?? {})
		.filter(([name]) => !DROPPED_HEADERS.has(name.toLowerCase()))
		.map(([name, value]) => [name, fitHeader(name, value)]));
	return {
		from: emailObject(message.from),
		to: message.to.map(emailObject),
		...(message.cc?.length ? { cc: message.cc.map(emailObject) } : {}),
		...(message.bcc?.length ? { bcc: message.bcc.map(emailObject) } : {}),
		subject: message.subject.slice(0, 255),
		// Never let the fallback rewrite links or add an open pixel the sender did not ask for.
		tracking: false,
		...(message.html ? { html: message.html } : {}),
		...(message.text ? { plain: message.text } : {}),
		...(Object.keys(headers).length ? { headers } : {}),
		...(message.attachments?.length
			? {
				attachments: message.attachments.map((attachment) => ({
					file_name: attachment.filename,
					content_type: attachment.type,
					content: toBase64(attachment.content),
					inline: attachment.disposition === "inline",
				})),
			}
			: {}),
	};
}

function mintMessageId(from: string): string {
	const domain = getEmailAddress(from).split("@")[1] || "mailflare.local";
	return `<${crypto.randomUUID()}@${domain}>`;
}

export async function sendWithMaileroo(apiKey: string, message: OutboundProviderMessage): Promise<{ messageId: string }> {
	const response = await fetch(MAILEROO_SEND_URL, {
		method: "POST",
		headers: { "X-Api-Key": apiKey, "Content-Type": "application/json" },
		body: JSON.stringify(mailerooPayload(message)),
	});
	const body = (await response.json().catch(() => null)) as { success?: boolean; message?: string } | null;
	if (!response.ok || body?.success === false) {
		throw new ProviderHttpError(`Maileroo: ${body?.message ?? `request failed (${response.status})`}`, response.status);
	}
	// Maileroo assigns its own Message-ID and does not return it; replies to this message may not thread.
	return { messageId: message.headers?.["Message-ID"] ?? mintMessageId(message.from) };
}

/**
 * Sends through Resend and falls back to Maileroo when Resend definitively did not take the message.
 * The outbound job is attempted once, so the fallback happens here: a network error first retries
 * Resend with the same idempotency key (no duplicate), then falls back. A 400/422 means the message
 * itself is wrong and is never retried elsewhere.
 */
export async function sendWithMailerooFallback(
	env: unknown,
	message: OutboundProviderMessage,
	sendPrimary: () => Promise<{ messageId: string }>,
): Promise<{ messageId: string }> {
	let primaryError: unknown;
	try {
		return await sendPrimary();
	} catch (error) {
		primaryError = error;
	}
	if (!(primaryError instanceof ProviderHttpError)) {
		try {
			return await sendPrimary();
		} catch (error) {
			primaryError = error;
		}
	}
	if (primaryError instanceof ProviderHttpError && !isFallbackStatus(primaryError.status)) throw primaryError;
	const key = getMailerooKey(env, message.from);
	if (!key) throw primaryError;
	const reason = primaryError instanceof Error ? primaryError.message : String(primaryError);
	console.warn("Resend did not accept the message; sending through Maileroo", { reason });
	try {
		const result = await sendWithMaileroo(key, message);
		console.warn("Message sent through the Maileroo fallback", { from: getEmailAddress(message.from) });
		return result;
	} catch (fallbackError) {
		const fallbackReason = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
		throw new Error(`${reason}; ${fallbackReason}`);
	}
}
