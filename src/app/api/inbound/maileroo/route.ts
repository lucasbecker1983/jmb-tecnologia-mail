import { NextResponse } from "next/server";
import { safeEqual } from "@/lib/aws/ses-notification";
import { getEnv } from "@/lib/cloudflare";
import { getEmailAddress } from "@/lib/email/address";
import { intakeProviderMail, MAX_PROVIDER_MESSAGE_BYTES } from "@/lib/email/provider-intake";

export const dynamic = "force-dynamic";

type MailerooInbound = {
	envelope_sender?: string;
	recipients?: unknown;
	body?: { raw_mime?: { url?: string; size?: number } };
	validation_url?: string;
	deletion_url?: string;
};

function httpsUrl(value: unknown): URL | null {
	if (typeof value !== "string") return null;
	try {
		const url = new URL(value);
		return url.protocol === "https:" ? url : null;
	} catch {
		return null;
	}
}

function isMailerooHost(url: URL): boolean {
	return url.hostname === "maileroo.com" || url.hostname.endsWith(".maileroo.com");
}

/**
 * JMB fork: Maileroo inbound routing webhook (fallback receiver, e.g. a backup MX).
 * Maileroo does not sign webhooks, so the gate is the secret token in the route URL
 * (MAILEROO_WEBHOOK_TOKEN). Its one-time validation_url is called only after a successful
 * intake: a retry after our own failure must still be accepted, or the mail would be lost.
 */
export async function POST(request: Request) {
	const env = getEnv();
	const expected = (env as { MAILEROO_WEBHOOK_TOKEN?: string }).MAILEROO_WEBHOOK_TOKEN?.trim();
	if (!expected) return NextResponse.json({ error: "Maileroo receiving is not set up" }, { status: 503 });
	const token = new URL(request.url).searchParams.get("token") ?? "";
	if (!safeEqual(token, expected)) return NextResponse.json({ error: "Forbidden" }, { status: 401 });

	let payload: MailerooInbound;
	try {
		payload = (await request.json()) as MailerooInbound;
	} catch {
		return NextResponse.json({ error: "Invalid body" }, { status: 400 });
	}
	const recipients = Array.isArray(payload.recipients) ? payload.recipients.filter((value): value is string => typeof value === "string") : [];
	const from = typeof payload.envelope_sender === "string" ? getEmailAddress(payload.envelope_sender) : "";
	const rawUrl = httpsUrl(payload.body?.raw_mime?.url);
	if (!recipients.length || !rawUrl) return NextResponse.json({ delivered: 0, dropped: "Missing recipients or raw message" });
	const size = Number(payload.body?.raw_mime?.size ?? 0);
	if (size > MAX_PROVIDER_MESSAGE_BYTES) return NextResponse.json({ delivered: 0, dropped: "Message exceeds the 25 MiB receiving limit" });

	const rawResponse = await fetch(rawUrl);
	if (!rawResponse.ok) return NextResponse.json({ error: "Could not download the raw message" }, { status: 502 });
	const result = await intakeProviderMail(env, { from, recipients, raw: await rawResponse.arrayBuffer() });

	const validation = httpsUrl(payload.validation_url);
	if (validation && isMailerooHost(validation)) await fetch(validation).catch(() => undefined);
	const deletion = httpsUrl(payload.deletion_url);
	if (deletion && isMailerooHost(deletion)) await fetch(deletion, { method: "DELETE" }).catch(() => undefined);
	return NextResponse.json(result);
}
