import type { SupabaseClient, User } from "@supabase/supabase-js";
import { DEMO_ACCOUNTS, DEMO_FAMILY_ID } from "./demo";
import baseline from "../demo/shared-baseline.json";

/** Called only after the migration preflight. Does not seed or replace content. */
export async function provisionDemoAccounts(sb: SupabaseClient, password: string) {
  if (!password) throw new Error("The demo password needs to be supplied.");
  const users: User[] = [];
  for (let page = 1; ; page++) {
    const result = await sb.auth.admin.listUsers({ page, perPage: 100 });
    if (result.error) throw result.error;
    users.push(...result.data.users);
    if (result.data.users.length < 100) break;
  }
  function existingAccount(account: typeof DEMO_ACCOUNTS[number]) {
    const candidates = users.filter(u => u.email?.toLowerCase() === account.email ||
      (u.app_metadata.kin_family_id === "demo" && u.email?.split("@")[0] === account.name.toLowerCase()));
    if (candidates.length > 1) throw new Error("Conflicting duplicate demo accounts require reconciliation");
    return candidates[0];
  }
  for (const account of DEMO_ACCOUNTS) {
    const user = existingAccount(account);
    if (user?.app_metadata.kin_family_id && ![DEMO_FAMILY_ID, "demo"].includes(user.app_metadata.kin_family_id)) {
      throw new Error("Account belongs to another family");
    }
  }
  // Fresh projects need these exact membership rows before accounts can pass RLS.
  // Ignore existing rows so repeat provisioning preserves their content and IDs.
  const membershipRows: [string, Record<string, unknown>[]][] = [
    ["wearer", [{ family_id: DEMO_FAMILY_ID, name: "Rosa" }]],
    ["relatives", baseline.relatives],
  ];
  for (const [table, rows] of membershipRows) {
    const result = await sb.from(table).upsert(rows, { ignoreDuplicates: true });
    if (result.error) throw result.error;
  }
  const relatives = await sb.from("relatives").select("id,name").eq("family_id", DEMO_FAMILY_ID);
  if (relatives.error) throw relatives.error;
  for (const account of DEMO_ACCOUNTS) {
    if (account.contributorId && !relatives.data.some(r => r.id === account.contributorId && r.name === account.name)) {
      throw new Error("Canonical contributor mapping missing");
    }
  }
  for (const account of DEMO_ACCOUNTS) {
    const existing = existingAccount(account);
    const app_metadata = { ...existing?.app_metadata, kin_family_id: DEMO_FAMILY_ID,
      kin_contributor_id: account.contributorId, kin_role: account.role, kin_admin: account.role === "organizer" };
    const result = existing
      ? await sb.auth.admin.updateUserById(existing.id, { app_metadata, ...(existing.email !== account.email ? { email: account.email, email_confirm: true } : {}) })
      : await sb.auth.admin.createUser({ email: account.email, password, email_confirm: true, app_metadata });
    if (result.error) throw result.error;
    if (!result.data.user) throw new Error("Account provisioning returned no user");
    if (account.role === "wearer") {
      const membership = await sb.from("wearer_accounts").upsert({ user_id: result.data.user.id, family_id: DEMO_FAMILY_ID });
      if (membership.error) throw membership.error;
    }
  }
}
