import { DEMO_FAMILY_ID } from "../lib/demo";
import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";

async function main() {
  loadEnvConfig(process.cwd());
  const { seedDemo } = await import("../lib/seed");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase server configuration required");
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const result = await seedDemo(sb, DEMO_FAMILY_ID);
  console.log(JSON.stringify({ seeded: true, memories: result.memoryCount, embeddingStatus: result.embeddingStatus }));
}
main().catch(() => { console.error("Seed failed; verify numbered migrations and provider configuration. No credentials were logged."); process.exitCode = 1; });
