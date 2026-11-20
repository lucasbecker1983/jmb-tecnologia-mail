import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/cookies";
import { getEnv } from "@/lib/cloudflare";
import { getHomeBranding } from "./home-server-utils";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const branding = await getHomeBranding();
  return { title: branding.appName };
}

// JMB fork: this address is a webmail, so the root opens the mailbox or the login, never a landing page.
export default async function HomePage() {
  // A session lookup failure must not break the address: fall back to the login.
  const sessionUser = await getCurrentUser(getEnv()).catch(() => null);
  redirect(sessionUser && !sessionUser.disabled ? "/inbox" : "/login");
}
