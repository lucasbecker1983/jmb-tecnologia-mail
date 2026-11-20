import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { getDb } from "@/db";
import { domains } from "@/db/schema";

/**
 * JMB fork: the mail domain for a webmail.<domain> address, when that domain is registered here.
 * Decided on the server so a crafted host cannot make the login page suggest a foreign domain.
 */
export async function getLoginDomain(env: CloudflareEnv): Promise<string | null> {
	const host = ((await headers()).get("host") ?? "").toLowerCase().split(":")[0];
	if (!host.startsWith("webmail.")) return null;
	const candidate = host.slice("webmail.".length);
	try {
		const [row] = await getDb(env).select({ hostname: domains.hostname }).from(domains).where(eq(domains.hostname, candidate)).limit(1);
		return row?.hostname ?? null;
	} catch {
		return null;
	}
}
