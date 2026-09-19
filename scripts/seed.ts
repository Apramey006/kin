// Seed the demo family. Usage: npx tsx scripts/seed.ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");

// Load .env.local without a dotenv dependency.
try {
  const env = readFileSync(join(rootDir, ".env.local"), "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {
  // .env.local missing; rely on real env vars
}

import { seedDemo } from "../lib/seed";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const familyId = process.env.KIN_FAMILY_ID ?? "demo";
const sb = createClient(url, key, { auth: { persistSession: false } });

seedDemo(sb, familyId)
  .then((r) => {
    console.log("Seeded family:", familyId);
    console.log(r);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
