import { Globe2 } from "@/components/icons";
import { useLanguage } from "@/components/language-provider";
import type { DomainPreflight } from "./types";

/** Shown when the domain's DNS is outside this Cloudflare account (JMB fork). */
export default function ExternalDnsNotice({ dnsHost }: { dnsHost: DomainPreflight["dnsHost"] }) {
	const { t } = useLanguage();
	const provider = dnsHost?.provider ?? t("domains.external.unknownProvider");
	return (
		<div className="flex gap-3 rounded-xl bg-blue-50 px-4 py-3 text-sm text-blue-900">
			<Globe2 className="mt-0.5 h-4 w-4 shrink-0" />
			<div className="space-y-1">
				<p className="font-medium">{t("domains.external.title", { provider })}</p>
				<p>{t("domains.external.body", { provider })}</p>
				{dnsHost && dnsHost.nameservers.length > 0 && (
					<p className="text-xs text-blue-800/80">{t("domains.external.nameservers", { list: dnsHost.nameservers.join(", ") })}</p>
				)}
			</div>
		</div>
	);
}
