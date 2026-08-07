import { eq } from "drizzle-orm";
import { db, users } from "./db";

export type AccountStatus = "active" | "trial" | "suspended";

export async function getAccountStatus(userId: string): Promise<AccountStatus> {
  const [row] = await db
    .select({ accountStatus: users.accountStatus })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return (row?.accountStatus as AccountStatus) ?? "active";
}

export function isAccountActive(status: AccountStatus): boolean {
  return status === "active" || status === "trial";
}

export async function isUserActive(userId: string): Promise<boolean> {
  return isAccountActive(await getAccountStatus(userId));
}
