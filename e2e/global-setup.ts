import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";

// A temporary, confirmed account: no verification email and no family data.
// Deleted after the suite. UI fixture data is intercepted in each test.
export default async function setup() {
  loadEnvConfig(process.cwd());
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  if (!['127.0.0.1', 'localhost'].includes(new URL(url).hostname))
    throw new Error('Browser checks require a local Supabase endpoint; shared projects are not test fixtures.');
  const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
  const email = `kin-browser-${crypto.randomUUID()}@example.invalid`;
  const password = crypto.randomUUID() + "aA1!";
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: "Maya" },
  });
  if (error) throw error;
  try {
    const cookies: {
      name: string;
      value: string;
      domain: string;
      path: string;
      httpOnly: boolean;
      secure: boolean;
      sameSite: "Lax";
      expires: number;
    }[] = [];
    const base = new URL(
      process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3100",
    );
    const auth = createServerClient(
      url,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => cookies,
          setAll: (items) =>
            items.forEach((c) =>
              cookies.push({
                name: c.name,
                value: c.value,
                domain: base.hostname,
                path: "/",
                httpOnly: false,
                secure: base.protocol === "https:",
                sameSite: "Lax",
                expires: Math.floor(Date.now() / 1000) + 3600,
              }),
            ),
        },
      },
    );
    const signed = await auth.auth.signInWithPassword({ email, password });
    if (signed.error) throw signed.error;
    mkdirSync("test-results/.auth", { recursive: true });
    writeFileSync(
      "test-results/.auth/user.json",
      JSON.stringify({ cookies, origins: [] }),
      { mode: 0o600 },
    );
  } catch (error) {
    await admin.auth.admin.deleteUser(data.user.id);
    throw error;
  }
  return async () => {
    const result = await admin.auth.admin.deleteUser(data.user.id);
    rmSync("test-results/.auth", { recursive: true, force: true });
    if (result.error) throw result.error;
  };
}
