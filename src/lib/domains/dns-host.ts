import { findZoneByHostname } from "@/lib/cloudflare-api";
import { queryDns } from "@/lib/dns-query";
import { manualDomainPreflight } from "@/lib/domains/preflight";
import { normalizeHostname } from "@/lib/domains/utils";
import { hasCloudflareCredentials } from "@/lib/runtime";

// JMB fork: domains whose DNS lives outside this Cloudflare account are detected and added
// as external (manual zone, Resend for mail) instead of failing with "Zone not found".

export type DnsHost = { provider: string | null; nameservers: string[]; cloudflare: boolean };

export type DomainHostingCheck = {
	hostname: string;
	zone: { id: string; name: string };
	external: boolean;
	dnsHost?: DnsHost;
};

const PROVIDERS: [RegExp, string][] = [
	[/\.ns\.cloudflare\.com$/, "Cloudflare"],
	[/\.dns\.br$/, "Registro.br"],
	[/umbler\./, "Umbler"],
	[/locaweb\.com\.br$/, "Locaweb"],
	[/hostgator/, "HostGator"],
	[/kinghost/, "KingHost"],
	[/uolhost|hostnet\.com\.br$/, "UOL Host"],
	[/hostinger|dns-parking\.com$/, "Hostinger"],
	[/domaincontrol\.com$/, "GoDaddy"],
	[/awsdns/, "Amazon Route 53"],
	[/googledomains\.com$/, "Google Cloud DNS"],
	[/azure-dns\./, "Azure DNS"],
	[/registrar-servers\.com$/, "Namecheap"],
	[/vercel-dns\.com$/, "Vercel"],
	[/digitalocean\.com$/, "DigitalOcean"],
];

const UNKNOWN: DnsHost = { provider: null, nameservers: [], cloudflare: false };

/** Finds who answers for the domain's DNS. Only used for labels; a failed lookup never blocks adding a domain. */
export async function detectDnsHost(hostname: string): Promise<DnsHost> {
	const labels = normalizeHostname(hostname).split(".");
	for (let index = 0; index < labels.length - 1; index++) {
		const name = labels.slice(index).join(".");
		let answers: string[];
		try {
			answers = await queryDns(name, "NS");
		} catch {
			return UNKNOWN;
		}
		if (answers.length === 0) continue;
		const nameservers = answers.map((value) => value.replace(/\.$/, "").toLowerCase()).sort();
		const provider = PROVIDERS.find(([pattern]) => nameservers.some((server) => pattern.test(server)))?.[1] ?? null;
		return { provider, nameservers, cloudflare: provider === "Cloudflare" };
	}
	return UNKNOWN;
}

/**
 * Decides how a new domain is managed. The Cloudflare zone lookup is authoritative: a zone this
 * account can see is managed as before; a definitive "no zone" makes the domain external. API
 * errors still throw, so a bad token never silently turns a Cloudflare domain into an external one.
 */
export async function checkDomainHosting(env: CloudflareEnv, hostname: string, options?: { skipDns?: boolean }): Promise<DomainHostingCheck> {
	if (options?.skipDns || !hasCloudflareCredentials(env)) return { ...manualDomainPreflight(hostname), external: false };
	const normalized = normalizeHostname(hostname);
	const zone = await findZoneByHostname(env, normalized);
	if (zone) return { hostname: normalized, zone, external: false };
	const dnsHost = await detectDnsHost(normalized);
	if (dnsHost.cloudflare) {
		throw new Error(
			`O DNS de "${normalized}" está na Cloudflare, mas o token CF_TOKEN não enxerga essa zona. Inclua o domínio nas permissões do token ou use a conta Cloudflare onde ele está.`,
		);
	}
	return { ...manualDomainPreflight(normalized), external: true, dnsHost };
}
