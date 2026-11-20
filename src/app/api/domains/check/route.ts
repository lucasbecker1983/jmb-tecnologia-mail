import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/cookies";
import { getEnv } from "@/lib/cloudflare";
import { checkDomainHosting } from "@/lib/domains/dns-host";
import { setupDomainSchema } from "@/lib/validators";

export async function POST(request: Request) {
	const env = getEnv();
	await requireUser(env, request);
	const parsed = setupDomainSchema.safeParse(await request.json());
	if (!parsed.success) {
		return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
	}

	try {
		return NextResponse.json({ domain: await checkDomainHosting(env, parsed.data.hostname, { skipDns: parsed.data.skipDns }) });
	} catch (error) {
		const message = error instanceof Error ? error.message : "Domain check failed";
		return NextResponse.json({ error: message }, { status: 502 });
	}
}
