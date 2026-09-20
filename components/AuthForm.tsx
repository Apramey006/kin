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
export type AuthMode = "signin" | "signup" | "forgot" | "update";
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
      /^\/(family|stage|wearer|settings|onboarding)(\?|$)/.test(next)
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
    <div className="auth-page">
      <header className="auth-nav">
        <Brand />
        <Link
          href={mode === "signup" ? "/signin" : "/signup"}
          className="button button-quiet button-sm"
        >
          {mode === "signup"
            ? "Already a member? Sign in"
            : "New to Kin? Get started"}
        </Link>
      </header>
      <main
        id="main-content"
        className={`auth-card animate-in ${sent ? "auth-success" : ""}`}
      >
        <div className="auth-icon">
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
            <h1>
              {mode === "update" ? "You’re all set." : "Check your email."}
            </h1>
            <p className="muted">
              {mode === "update"
                ? "Your password has been updated. Your memories are right where you left them."
                : mode === "signup"
                  ? `We sent a confirmation link to ${email}. Open it to finish creating your account.`
                  : `If there’s an account for ${email}, a reset link is on its way.`}
            </p>
            <Link
              href={mode === "update" ? "/family" : "/signin"}
              className="button button-primary full"
            >
              {mode === "update" ? "Back to your family" : "Back to sign in"}
              <ArrowRight aria-hidden="true" />
            </Link>
            <p className="small muted" style={{ marginTop: 20 }}>
              {" "}
              {mode !== "update" &&
                "Can’t find it? Check your spam folder, too."}
            </p>
          </>
        ) : (
          <>
            <h1>{titles[mode]}</h1>
            <p className="muted">{descriptions[mode]}</p>
            <form onSubmit={submit}>
              {mode === "signup" && (
                <div className="field">
                  <label htmlFor="full-name">Your name</label>
                  <input
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
                <div className="field">
                  <label htmlFor="email">Email address</label>
                  <input
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
                <div className="field">
                  <label htmlFor="password">
                    {mode === "update" ? "New password" : "Password"}
                  </label>
                  <div className="password-wrap">
                    <input
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
                    />
                    <button
                      className="password-toggle"
                      type="button"
                      aria-label={show ? "Hide password" : "Show password"}
                      aria-pressed={show}
                      onClick={() => setShow(!show)}
                    >
                      {show ? (
                        <EyeOff aria-hidden="true" />
                      ) : (
                        <Eye aria-hidden="true" />
                      )}
                    </button>
                  </div>
                  {mode !== "signin" && (
                    <small id="password-hint">
                      Use at least 8 characters. A longer phrase is easier to
                      remember.
                    </small>
                  )}
                </div>
              )}
              {mode === "signin" && (
                <div className="form-meta">
                  <span></span>
                  <Link className="text-link" href="/forgot-password">
                    Forgot password?
                  </Link>
                </div>
              )}
              {error && (
                <p className="notice notice-error" role="alert">
                  {error}
                </p>
              )}
              <Button type="submit" size="lg" className="full" disabled={busy}>
                {busy ? (
                  <>
                    <span className="spinner" aria-hidden="true" />
                    One moment…
                  </>
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
            <p className="form-footer">
              {mode === "signup" ? (
                <>
                  Have an account?{" "}
                  <Link href="/signin" className="text-link">
                    Sign in
                  </Link>
                </>
              ) : mode === "signin" ? (
                <>
                  New to Kin?{" "}
                  <Link href="/signup" className="text-link">
                    Create an account
                  </Link>
                </>
              ) : (
                <Link href="/signin" className="text-link">
                  Back to sign in
                </Link>
              )}
            </p>
          </>
        )}
      </main>
      <p className="footer-note">Your memories. Shared with your family.</p>
    </div>
  );
}
