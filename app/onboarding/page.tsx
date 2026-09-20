"use client";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Heart,
  Users,
  Check,
  Camera,
} from "lucide-react";
import { Brand } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getAnonClient } from "@/lib/supabase";

const fieldLabel = "mb-1.5 block text-sm font-medium text-ink-soft";
const errorBox =
  "rounded-xl border border-amber-600/30 bg-amber-50 px-4 py-3 text-sm text-amber-800";
const choiceCard =
  "flex w-full items-center gap-4 rounded-2xl border border-ink/10 bg-white px-5 py-5 text-left shadow-soft transition hover:border-primary/30 hover:shadow-lift";

async function invitationDetails(value: string) {
  let token = value.trim();
  if (token.includes("/")) {
    try {
      token = new URL(token).searchParams.get("invite") ?? token;
    } catch {}
  }
  const r = await fetch(`/api/invite?token=${encodeURIComponent(token)}`, {
    cache: "no-store",
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error ?? "Could not open this invitation.");
  return { ...j, token } as {
    role: "contributor" | "loved_one";
    lovedOne: string;
    token: string;
  };
}

export default function Onboarding() {
  const [step, setStep] = useState(0);
  const [mode, setMode] = useState<"create" | "join">("create");
  const [name, setName] = useState("");
  const [lovedOne, setLovedOne] = useState("");
  const [relationship, setRelationship] = useState("");
  const [invite, setInvite] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let pending = new URLSearchParams(window.location.search).get("invite");
    try {
      pending = pending || localStorage.getItem("kin-pending-invite");
    } catch {}
    if (pending) {
      setInvite(pending);
      setMode("join");
      setStep(1);
    }
    fetch("/api/account")
      .then(async (r) => {
        const j = await r.json();
        if (r.status === 401) {
          window.location.replace(
            "/signin?next=" +
              encodeURIComponent(
                window.location.pathname + window.location.search,
              ),
          );
          return;
        }
        if (!r.ok) throw new Error(j.error);
        if (j.membership) {
          window.location.replace(
            j.membership.role === "loved_one" ? "/wearer" : "/family",
          );
          return;
        }
        setName(j.name || "");
        if (pending) {
          const invitation = await invitationDetails(pending);
          setInvite(invitation.token);
          setLovedOne(invitation.lovedOne);
          if (invitation.role === "loved_one") setStep(4);
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    setBusy(true);
    try {
      if (step === 1) {
        if (mode === "join") {
          const invitation = await invitationDetails(invite);
          setInvite(invitation.token);
          setLovedOne(invitation.lovedOne);
          setStep(invitation.role === "loved_one" ? 4 : 2);
        } else setStep(2);
        return;
      }
      let token = invite.trim();
      if (token.includes("/")) {
        try {
          token = new URL(token).searchParams.get("invite") ?? token;
        } catch {}
      }
      const r = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          name: step === 4 ? undefined : name,
          relationship: step === 4 ? undefined : relationship,
          lovedOne: mode === "create" ? lovedOne : undefined,
          invite: mode === "join" ? token : undefined,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      try {
        localStorage.removeItem("kin-pending-invite");
      } catch {}
      if (j.destination === "/wearer") {
        window.location.replace("/wearer");
        return;
      }
      setStep(3);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex min-h-screen flex-col bg-paper text-ink">
      <header className="flex items-center justify-between px-6 py-4">
        <Brand />
        <Button
          variant="ghost"
          size="sm"
          onClick={async () => {
            await getAnonClient()?.auth.signOut();
            window.location.assign("/signin");
          }}
        >
          Sign out
        </Button>
      </header>
      <main
        id="main-content"
        className="mx-auto my-auto w-full max-w-md animate-fade-up rounded-4xl border border-ink/10 bg-paper-card p-8 shadow-soft"
      >
        <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-soft text-primary">
          {step === 3 ? (
            <Check aria-hidden="true" />
          ) : (
            <Heart aria-hidden="true" />
          )}
        </div>
        {loading ? (
          <>
            <h1 className="text-2xl font-semibold">Getting ready…</h1>
            <p className="mt-1.5 text-ink/60" role="status">
              Finding your place in Kin.
            </p>
          </>
        ) : (
          <>
            {step === 4 ? (
              <>
                <h1 className="text-2xl font-semibold">Welcome, {lovedOne}.</h1>
                <p className="mt-1.5 text-ink/60">
                  Your family has set up Kin for you. Point your camera at
                  someone familiar to hear a reminder from the memories they’ve
                  shared.
                </p>
                <form onSubmit={submit} className="mt-6">
                  <Button
                    type="submit"
                    size="lg"
                    className="w-full"
                    disabled={busy}
                  >
                    {busy ? "Connecting…" : "Join and open Kin"}
                    <ArrowRight aria-hidden="true" />
                  </Button>
                </form>
                <p className="mt-4 text-center text-sm text-ink/50">
                  Your family takes care of the photos and stories. You don’t
                  need to set anything else up.
                </p>
                <Button
                  variant="ghost"
                  className="mt-2 w-full"
                  onClick={() => {
                    setStep(1);
                    setError(null);
                  }}
                >
                  Use a different invitation
                </Button>
              </>
            ) : step === 0 ? (
              <>
                <h1 className="text-2xl font-semibold">Welcome to Kin.</h1>
                <p className="mt-1.5 text-ink/60">
                  Create a shared library or join your family.
                </p>
                <div className="mt-6 space-y-3">
                  <button
                    className={choiceCard}
                    onClick={() => {
                      setMode("create");
                      setStep(1);
                    }}
                  >
                    <Heart aria-hidden="true" className="h-6 w-6 shrink-0 text-primary" />
                    <span className="flex-1">
                      <strong className="block font-semibold">Create a family space</strong>
                      <small className="text-ink/55">Set up Kin for someone you love.</small>
                    </span>
                    <ArrowRight aria-hidden="true" className="h-5 w-5 text-ink/25" />
                  </button>
                  <button
                    className={choiceCard}
                    onClick={() => {
                      setMode("join");
                      setStep(1);
                    }}
                  >
                    <Users aria-hidden="true" className="h-6 w-6 shrink-0 text-primary" />
                    <span className="flex-1">
                      <strong className="block font-semibold">Join your family</strong>
                      <small className="text-ink/55">Someone has sent you an invitation.</small>
                    </span>
                    <ArrowRight aria-hidden="true" className="h-5 w-5 text-ink/25" />
                  </button>
                </div>
              </>
            ) : step === 3 ? (
              <>
                <h1 className="text-2xl font-semibold">Your family is ready.</h1>
                <p className="mt-1.5 text-ink/60">
                  {mode === "create"
                    ? `${lovedOne}’s family space is ready. Start with a photo of someone they know.`
                    : "Welcome to your family space. Your voice belongs here."}
                </p>
                <Button asChild size="lg" className="mt-6 w-full">
                  <Link href="/family?welcome=1">
                    Go to your memories
                    <ArrowRight aria-hidden="true" />
                  </Link>
                </Button>
                <p className="mt-4 text-center text-sm text-ink/50">
                  Invite someone else from your family whenever you’re ready.
                </p>
              </>
            ) : (
              <>
                <div
                  className="mb-4 flex gap-1.5"
                  aria-label={`Step ${step} of 2`}
                >
                  <span className="h-1.5 w-8 rounded-full bg-primary" />
                  <span
                    className={`h-1.5 w-8 rounded-full ${step === 2 ? "bg-primary" : "bg-ink/15"}`}
                  />
                </div>
                <h1 className="text-2xl font-semibold">
                  {step === 1
                    ? mode === "create"
                      ? "Who is Kin for?"
                      : "Join your family"
                    : "About you"}
                </h1>
                <p className="mt-1.5 text-ink/60">
                  {step === 1
                    ? mode === "create"
                      ? "We’ll build a space around the person you’re supporting."
                      : "Paste the invitation link your family shared with you."
                    : "Memories feel more familiar when we know who’s sharing them."}
                </p>
                <form onSubmit={submit} className="mt-6 space-y-4">
                  {step === 1 ? (
                    mode === "create" ? (
                      <div>
                        <label htmlFor="loved-one" className={fieldLabel}>
                          Their name
                        </label>
                        <Input
                          id="loved-one"
                          value={lovedOne}
                          onChange={(e) => setLovedOne(e.target.value)}
                          autoComplete="off"
                          required
                          maxLength={80}
                          placeholder="e.g. Rosa"
                        />
                        <small className="mt-1 block text-ink/50">
                          Use the name your family usually calls them.
                        </small>
                      </div>
                    ) : (
                      <div>
                        <label htmlFor="invitation" className={fieldLabel}>
                          Invitation link or code
                        </label>
                        <Input
                          id="invitation"
                          value={invite}
                          onChange={(e) => setInvite(e.target.value)}
                          autoComplete="off"
                          required
                          placeholder="Paste your invitation here"
                        />
                      </div>
                    )
                  ) : (
                    <>
                      <div>
                        <label htmlFor="your-name" className={fieldLabel}>
                          Your name
                        </label>
                        <Input
                          id="your-name"
                          required
                          maxLength={80}
                          autoComplete="name"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                        />
                      </div>
                      <div>
                        <label htmlFor="relationship" className={fieldLabel}>
                          Your relationship{" "}
                          {lovedOne ? `to ${lovedOne}` : "to your loved one"}
                        </label>
                        <select
                          id="relationship"
                          required
                          value={relationship}
                          onChange={(e) => setRelationship(e.target.value)}
                          className="h-11 w-full rounded-xl border border-ink/15 bg-white px-3.5 text-base text-ink focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                        >
                          <option value="" disabled>
                            Choose your relationship
                          </option>
                          {[
                            "Daughter",
                            "Son",
                            "Granddaughter",
                            "Grandson",
                            "Sister",
                            "Brother",
                            "Partner",
                            "Parent",
                            "Friend",
                            "Caregiver",
                            "Other family member",
                          ].map((r) => (
                            <option key={r} value={r.toLowerCase()}>
                              {r}
                            </option>
                          ))}
                        </select>
                      </div>
                    </>
                  )}
                  <div className="flex items-center gap-3 pt-2">
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setStep(step - 1);
                        setError(null);
                      }}
                      disabled={busy}
                    >
                      <ArrowLeft aria-hidden="true" />
                      Back
                    </Button>
                    <Button type="submit" className="flex-1" disabled={busy}>
                      {busy ? (
                        "Setting up…"
                      ) : (
                        <>
                          {step === 1
                            ? "Continue"
                            : mode === "create"
                              ? "Create family space"
                              : "Join family"}
                          <ArrowRight aria-hidden="true" />
                        </>
                      )}
                    </Button>
                  </div>
                </form>
              </>
            )}
            {error && (
              <p className={`${errorBox} mt-5`} role="alert">
                {error}
              </p>
            )}
          </>
        )}
      </main>
      <p className="flex items-center justify-center gap-1.5 pb-6 text-sm text-ink/40">
        <Camera size={14} aria-hidden="true" />
        You’ll be asked for camera or microphone access only when you use it.
      </p>
    </div>
  );
}
