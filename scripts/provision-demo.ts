import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { DEMO_ACCOUNTS, DEMO_FAMILY_ID } from "../lib/demo";

import { provisionDemoAccounts } from "../lib/demo-provision";

let stage = "environment";
async function main() {
  loadEnvConfig(process.cwd());
  const configured = existsSync(".env.demo.local") ? readFileSync(".env.demo.local", "utf8").match(/^KIN_DEMO_PASSWORD=(.+)$/m)?.[1]?.trim() : undefined;
  const password = process.env.KIN_DEMO_PASSWORD ?? configured?.replace(/^(["'])(.*)\1$/, "$2");
  if (!password) { console.error("The demo password needs to be supplied."); process.exitCode = 1; return; }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key || !publicKey) throw new Error("Supabase configuration required");
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const sb = createClient(url, key, options);
  stage = "verify migrations 002 through 007";
  for (const [table, columns] of [["memories", "id,source,verified_facts"], ["ingestion_receipts", "id"],
    ["recall_events", "id,face_outcome,evidence,reason_code"], ["wearer_accounts", "user_id,family_id"],
    ["relatives", "id,is_self,self_capture_open"], ["pending_contributions", "id,payload,state"]]) {
    const result = await sb.from(table).select(columns).limit(1);
    if (result.error) throw result.error;
  }
  const legacy = await sb.from("wearer").select("family_id").eq("family_id", "demo").maybeSingle();
  if (legacy.error || legacy.data) throw new Error("Apply consolidation migration 005 first");
  // These deliberately invalid arguments fail before any write. Tables alone
  // are insufficient if an earlier version of the self migration was applied.
  for (const [name, args] of [
    ["capture_self_contribution", { payload: {}, preview: "" }],
    ["review_self_contribution", { family: DEMO_FAMILY_ID, reviewer: null, contribution: null, decision: "invalid" }],
  ] as const) {
    const probe = await sb.rpc(name, args);
    if (probe.error?.code !== "22023") throw new Error("Apply the complete self-contribution migration 007 first");
  }
  stage = "provision canonical accounts and self Keeper";
  await provisionDemoAccounts(sb, password);
  for (const account of DEMO_ACCOUNTS) {
    stage = "verify " + account.name;
    const client = createClient(url, publicKey, options);
    const login = await client.auth.signInWithPassword({ email: account.email, password });
    if (login.error) throw login.error;
    const claims = login.data.user?.app_metadata;
    if (claims?.kin_family_id !== DEMO_FAMILY_ID || (claims.kin_contributor_id ?? null) !== account.contributorId || claims.kin_role !== account.role) throw new Error("Claims mismatch");
    const own = await client.from("wearer").select("family_id");
    if (own.error || own.data.length !== 1 || own.data[0].family_id !== DEMO_FAMILY_ID) throw new Error("Family membership RLS failed");
    const foreign = await client.from("graph_nodes").select("id").neq("family_id", DEMO_FAMILY_ID);
    if (foreign.error || foreign.data.length) throw new Error("Family isolation failed");
    await client.auth.signOut();
    console.log(account.email + ": membership and sign-in verified");
  }
}
main().catch((error: unknown) => {
  const e = error as { code?: unknown; status?: unknown };
  console.error(JSON.stringify({ error: "Demo reconciliation failed", stage,
    code: typeof e.code === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(e.code) ? e.code : undefined,
    status: typeof e.status === "number" ? e.status : undefined }));
  process.exitCode = 1;
});
