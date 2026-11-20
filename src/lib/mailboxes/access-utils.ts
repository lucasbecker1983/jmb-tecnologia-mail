import type { AppDatabase } from "@/db";

// JMB fork: shared mailboxes are always enabled, independent of the license table.
export async function isTeamMailboxSharingEnabled(_db: AppDatabase): Promise<boolean> {
	return true;
}
