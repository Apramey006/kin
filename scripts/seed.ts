// Uses the same .env parsing as Next, including comments and quoted values.
import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";

loadEnvConfig(process.cwd());

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local");
  const { seedDemo } = await import("../lib/seed");
  const familyId = process.env.NEXT_PUBLIC_KIN_FAMILY_ID || "demo";
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const result = await seedDemo(sb, familyId);
  console.log("Seeded family:", familyId, result);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Seed failed");
  process.exitCode = 1;
});
