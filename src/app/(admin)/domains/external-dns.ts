import { authFetch } from "@/lib/auth/client";

type CreatedDomain = { id?: string; zoneId?: string; dnsSkipped?: boolean };

/**
 * JMB fork: a domain detected outside Cloudflare is added on a manual zone with Resend for mail.
 * Run Resend's receiving and then sending setup right away so its page already lists the records
 * to create at the DNS provider. Sequential because both touch the same Resend domain; a failure
 * (no key yet, plan limit) leaves the domain added and shows in its provider card.
 */
export async function setupExternalDomainMail(created: unknown): Promise<void> {
	const domain = created as CreatedDomain | undefined;
	if (!domain?.id || domain.zoneId !== "manual" || domain.dnsSkipped) return;
	const steps: [string, Record<string, unknown>][] = [
		[`/api/domains/${domain.id}/receiving/resend`, {}],
		[`/api/domains/${domain.id}/resend`, { action: "setup" }],
	];
	for (const [path, body] of steps) {
		try {
			await authFetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
		} catch {
			// The provider card reports what is still missing.
		}
	}
}
