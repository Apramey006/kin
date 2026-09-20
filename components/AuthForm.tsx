"use client";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import {
  ArrowRight,
  Eye,
  EyeOff,
  Heart,
  KeyRound,
  Mail,
  Check,
} from "lucide-react";
import { getAnonClient } from "@/lib/supabase";
import { Brand } from "./Brand";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

export type AuthMode = "signin" | "signup" | "forgot" | "update";

const fieldLabel = "mb-1.5 block text-sm font-medium text-ink-soft";
const errorBox =
  "rounded-xl border border-amber-600/30 bg-amber-50 px-4 py-3 text-sm text-amber-800";

export function AuthForm({ mode }: { mode: AuthMode }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get("error") === "expired-link")
      setError(
        "That email link has expired or was already used. Sign in, or request a new password reset link.",
      );
    const next = q.get("next");
    const invitation =
      q.get("invite") ||
      (next?.startsWith("/onboarding?")
        ? new URLSearchParams(next.split("?")[1]).get("invite")
        : null);
    if (invitation) {
      try {
        localStorage.setItem("kin-pending-invite", invitation);
      } catch {}
    }
  }, []);

  const titles = {
    signin: "Sign in to Kin",
    signup: "Create your account",
    forgot: "Reset your password",
    update: "New password",
  };
  const descriptions = {
    signin: "Access your family’s shared memories.",
    signup: "Keep your family’s photos and stories together.",
    forgot: "Enter your email and we’ll send you a password reset link.",
    update: "Choose a new password for your Kin account.",
  };
  const safeNext = () => {
    const next = new URLSearchParams(window.location.search).get("next");
    return next &&
      /^\/(family|stage|graph|wearer|settings|onboarding)(\?|$)/.test(next)
      ? next
      : "/family";
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const sb = getAnonClient();
      if (!sb)
        throw new Error("Kin isn’t connected yet. Please try again later.");
      if (mode === "signin") {
        const { error } = await sb.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        window.location.assign(safeNext());
      }
      if (mode === "signup") {
        let invite = new URLSearchParams(window.location.search).get("invite");
        try {
          invite = invite || localStorage.getItem("kin-pending-invite");
          if (invite) localStorage.setItem("kin-pending-invite", invite);
        } catch {}
        const callback = new URL("/auth/callback", window.location.origin);
        if (invite && /^[0-9a-f-]{36}$/i.test(invite))
          callback.searchParams.set("invite", invite);
        const { data, error } = await sb.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { full_name: name.trim() },
            emailRedirectTo: callback.toString(),
          },
        });
        if (error) throw error;
        if (data.session)
          window.location.assign(
            invite
              ? `/onboarding?invite=${encodeURIComponent(invite)}`
              : "/onboarding",
          );
        else setSent(true);
      }
      if (mode === "forgot") {
        const { error } = await sb.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/auth/callback?next=/update-password`,
        });
        if (error) throw error;
        setSent(true);
      }
      if (mode === "update") {
        const { error } = await sb.auth.updateUser({ password });
        if (error)
          throw new Error(
            "Your reset link may have expired. Request a new link and try again.",
          );
        setSent(true);
      }
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex min-h-screen flex-col bg-paper text-ink">
      <header className="flex items-center justify-between px-6 py-4">
        <Brand />
        <Button asChild variant="ghost" size="sm">
          <Link href={mode === "signup" ? "/signin" : "/signup"}>
            {mode === "signup"
              ? "Already a member? Sign in"
              : "New to Kin? Get started"}
          </Link>
        </Button>
      </header>
      <main
        id="main-content"
        className="mx-auto my-auto w-full max-w-md animate-fade-up rounded-4xl border border-ink/10 bg-paper-card p-8 shadow-soft"
      >
        <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-soft text-primary">
          {sent ? (
            mode === "update" ? (
              <Check aria-hidden="true" />
            ) : (
              <Mail aria-hidden="true" />
            )
          ) : mode === "forgot" || mode === "update" ? (
            <KeyRound aria-hidden="true" />
          ) : (
            <Heart aria-hidden="true" />
          )}
        </div>
        {sent ? (
          <>
            <h1 className="text-2xl font-semibold">
              {mode === "update" ? "You’re all set." : "Check your email."}
            </h1>
            <p className="mt-2 text-ink/60">
              {mode === "update"
                ? "Your password has been updated. Your memories are right where you left them."
                : mode === "signup"
                  ? `We sent a confirmation link to ${email}. Open it to finish creating your account.`
                  : `If there’s an account for ${email}, a reset link is on its way.`}
            </p>
            <Button asChild size="lg" className="mt-6 w-full">
              <Link href={mode === "update" ? "/family" : "/signin"}>
                {mode === "update" ? "Back to your family" : "Back to sign in"}
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
            {mode !== "update" && (
              <p className="mt-5 text-sm text-ink/50">
                Can’t find it? Check your spam folder, too.
              </p>
            )}
          </>
        ) : (
          <>
            <h1 className="text-2xl font-semibold">{titles[mode]}</h1>
            <p className="mt-1.5 text-ink/60">{descriptions[mode]}</p>
            <form onSubmit={submit} className="mt-6 space-y-4">
              {mode === "signup" && (
                <div>
                  <label htmlFor="full-name" className={fieldLabel}>
                    Your name
                  </label>
                  <Input
                    id="full-name"
                    name="name"
                    autoComplete="name"
                    required
                    maxLength={80}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="How your family knows you"
                  />
                </div>
              )}
              {mode !== "update" && (
                <div>
                  <label htmlFor="email" className={fieldLabel}>
                    Email address
                  </label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    inputMode="email"
                    autoCapitalize="none"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                  />
                </div>
              )}
              {mode !== "forgot" && (
                <div>
                  <label htmlFor="password" className={fieldLabel}>
                    {mode === "update" ? "New password" : "Password"}
                  </label>
                  <div className="relative">
                    <Input
                      id="password"
                      name="password"
                      type={show ? "text" : "password"}
                      autoComplete={
                        mode === "signin" ? "current-password" : "new-password"
                      }
                      required
                      minLength={mode === "signin" ? 1 : 8}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      aria-describedby={
                        mode !== "signin" ? "password-hint" : undefined
                      }
                      className="pr-11"
                    />
                    <button
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-ink/45 hover:bg-ink/5 hover:text-ink"
                      type="button"
                      aria-label={show ? "Hide password" : "Show password"}
                      aria-pressed={show}
                      onClick={() => setShow(!show)}
                    >
                      {show ? (
                        <EyeOff aria-hidden="true" className="h-5 w-5" />
                      ) : (
                        <Eye aria-hidden="true" className="h-5 w-5" />
                      )}
                    </button>
                  </div>
                  {mode !== "signin" && (
                    <small id="password-hint" className="mt-1 block text-ink/50">
                      Use at least 8 characters. A longer phrase is easier to
                      remember.
                    </small>
                  )}
                </div>
              )}
              {mode === "signin" && (
                <div className="flex justify-end">
                  <Link
                    className="text-sm font-medium text-primary hover:underline"
                    href="/forgot-password"
                  >
                    Forgot password?
                  </Link>
                </div>
              )}
              {error && (
                <p className={errorBox} role="alert">
                  {error}
                </p>
              )}
              <Button type="submit" size="lg" className="w-full" disabled={busy}>
                {busy ? (
                  "One moment…"
                ) : (
                  <>
                    {mode === "signin"
                      ? "Sign in"
                      : mode === "signup"
                        ? "Create account"
                        : mode === "forgot"
                          ? "Send reset link"
                          : "Save new password"}
                    <ArrowRight aria-hidden="true" />
                  </>
                )}
              </Button>
            </form>
            <p className="mt-6 text-center text-sm text-ink/55">
              {mode === "signup" ? (
                <>
                  Have an account?{" "}
                  <Link href="/signin" className="font-medium text-primary hover:underline">
                    Sign in
                  </Link>
                </>
              ) : mode === "signin" ? (
                <>
                  New to Kin?{" "}
                  <Link href="/signup" className="font-medium text-primary hover:underline">
                    Create an account
                  </Link>
                </>
              ) : (
                <Link href="/signin" className="font-medium text-primary hover:underline">
                  Back to sign in
                </Link>
              )}
            </p>
          </>
        )}
      </main>
      <p className="pb-6 text-center text-sm text-ink/40">
        Your memories. Shared with your family.
      </p>
    </div>
  );
}
