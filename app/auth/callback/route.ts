import { NextResponse } from "next/server";
import { getAuthClient } from "@/lib/auth/server";
import type { EmailOtpType } from "@supabase/supabase-js";
export async function GET(request: Request) {
  const url = new URL(request.url);
  const auth = await getAuthClient();
  const code = url.searchParams.get("code");
  const token = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  const result = code
    ? await auth.auth.exchangeCodeForSession(code)
    : token && ["signup", "recovery", "email", "invite"].includes(type ?? "")
      ? await auth.auth.verifyOtp({
          token_hash: token,
          type: type as EmailOtpType,
        })
      : null;
  const next = url.searchParams.get("next");
  const invite = url.searchParams.get("invite");
  const onboarding =
    invite && /^[0-9a-f-]{36}$/i.test(invite)
      ? `/onboarding?invite=${encodeURIComponent(invite)}`
      : "/onboarding";
  const destination =
    next === "/update-password" || type === "recovery"
      ? "/update-password"
      : onboarding;
  return NextResponse.redirect(
    new URL(
      result && !result.error ? destination : "/signin?error=expired-link",
      url.origin,
    ),
  );
}
