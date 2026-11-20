import { and, eq, ne } from "drizzle-orm";
import { getDb } from "@/db";
import { domains } from "@/db/schema";
import { isManualZone } from "@/lib/domains/provision";
import { checkDomainHosting, hasPendingCloudflareZone } from "@/lib/domains/dns-host";
import type { DomainRow } from "@/lib/domains/types";
import { hasCloudflareCredentials } from "@/lib/runtime";

/**
 * A domain added with DNS skipped has the "manual" zone, which every Cloudflare
 * call ignores. Choosing Cloudflare sending or receiving later swaps in the real
 * zone so the usual setup can run. Returns the row unchanged when it already has
 * one, or when there are no Cloudflare credentials to look the zone up with.
 */
export async function adoptCloudflareZone(env: CloudflareEnv, domain: DomainRow): Promise<DomainRow> {
	if (!isManualZone(domain.zoneId) || !hasCloudflareCredentials(env)) return domain;
	const db = getDb(env);
	const hosting = await checkDomainHosting(env, domain.hostname);
	if (hosting.external) {
		// JMB fork: the DNS is elsewhere, so this is an external domain, not a skipped one.
		// Mark it so its page lists the records to create by hand instead of offering Cloudflare setup.
		if (domain.dnsSkipped || domain.status !== "active") {
			await db.update(domains).set({ dnsSkipped: false, status: "active" }).where(eq(domains.id, domain.id));
		}
		const where = hosting.dnsHost?.provider ?? "seu provedor de DNS";
		if (await hasPendingCloudflareZone(env, domain.hostname)) {
			throw new Error(
				`${domain.hostname} já foi adicionado à Cloudflare, mas os nameservers ainda são os de ${where}. Troque os nameservers no registro do domínio (ex.: Registro.br) pelos que a Cloudflare indicou e clique de novo depois que a troca propagar.`,
			);
		}
		throw new Error(
			`O DNS de ${domain.hostname} está em ${where}, fora da Cloudflare, então o app não consegue criar registros nele. Recarregue a página: ela passa a listar os registros para você criar no painel de ${where}.`,
		);
	}
	const { zone } = hosting;
	const [claimed] = await db
		.select({ id: domains.id })
		.from(domains)
		.where(and(eq(domains.zoneId, zone.id), ne(domains.userId, domain.userId)))
		.limit(1);
	if (claimed) throw new Error("Cloudflare zone is already registered to another account");
	await db.update(domains).set({ zoneId: zone.id }).where(eq(domains.id, domain.id));
	return { ...domain, zoneId: zone.id };
}
