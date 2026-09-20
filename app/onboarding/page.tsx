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
import { getAnonClient } from "@/lib/supabase";
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
    <div className="auth-page">
      <header className="auth-nav">
        <Brand />
        <button
          className="button button-quiet button-sm"
          onClick={async () => {
            await getAnonClient()?.auth.signOut();
            window.location.assign("/signin");
          }}
        >
          Sign out
        </button>
      </header>
      <main id="main-content" className="auth-card onboarding-card animate-in">
        <div className="auth-icon">
          {step === 3 ? (
            <Check aria-hidden="true" />
          ) : (
            <Heart aria-hidden="true" />
          )}
        </div>
        {loading ? (
          <>
            <h1>Getting ready…</h1>
            <p className="muted" role="status">
              Finding your place in Kin.
            </p>
          </>
        ) : (
          <>
            {step === 4 ? (
              <>
                <h1>Welcome, {lovedOne}.</h1>
                <p className="muted">
                  Your family has set up Kin for you. Point your camera at
                  someone familiar to hear a reminder from the memories they’ve
                  shared.
                </p>
                <form onSubmit={submit}>
                  <Button
                    type="submit"
                    size="lg"
                    className="full"
                    disabled={busy}
                  >
                    {busy ? "Connecting…" : "Join and open Kin"}
                    <ArrowRight aria-hidden="true" />
                  </Button>
                </form>
                <p className="onboard-caption">
                  Your family takes care of the photos and stories. You don’t
                  need to set anything else up.
                </p>
                <button
                  className="button button-quiet full"
                  onClick={() => {
                    setStep(1);
                    setError(null);
                  }}
                >
                  Use a different invitation
                </button>
              </>
            ) : step === 0 ? (
              <>
                <h1>
                  Welcome to Kin.
                  <br />
                </h1>
                <p className="muted">
                  Create a shared library or join your family.
                </p>
                <div className="stack">
                  <button
                    className="choice-card"
                    onClick={() => {
                      setMode("create");
                      setStep(1);
                    }}
                  >
                    <Heart aria-hidden="true" />
                    <span>
                      <strong>Create a family space</strong>
                      <small>Set up Kin for someone you love.</small>
                    </span>
                    <ArrowRight aria-hidden="true" />
                  </button>
                  <button
                    className="choice-card"
                    onClick={() => {
                      setMode("join");
                      setStep(1);
                    }}
                  >
                    <Users aria-hidden="true" />
                    <span>
                      <strong>Join your family</strong>
                      <small>Someone has sent you an invitation.</small>
                    </span>
                    <ArrowRight aria-hidden="true" />
                  </button>
                </div>
              </>
            ) : step === 3 ? (
              <>
                <h1>
                  Your family is ready.
                  <br />
                </h1>
                <p className="muted">
                  {mode === "create"
                    ? `${lovedOne}’s family space is ready. Start with a photo of someone they know.`
                    : "Welcome to your family space. Your voice belongs here."}
                </p>
                <Link
                  href="/family?welcome=1"
                  className="button button-primary full button-lg"
                >
                  Go to your memories
                  <ArrowRight aria-hidden="true" />
                </Link>
                <p className="onboard-caption">
                  Invite someone else from your family whenever you’re ready.
                </p>
              </>
            ) : (
              <>
                <div
                  className="step-indicator"
                  aria-label={`Step ${step} of 2`}
                >
                  <span className="active" />
                  <span className={step === 2 ? "active" : ""} />
                </div>
                <h1>
                  {step === 1
                    ? mode === "create"
                      ? "Who is Kin for?"
                      : "Join your family"
                    : "About you"}
                </h1>
                <p className="muted">
                  {step === 1
                    ? mode === "create"
                      ? "We’ll build a space around the person you’re supporting."
                      : "Paste the invitation link your family shared with you."
                    : "Memories feel more familiar when we know who’s sharing them."}
                </p>
                <form onSubmit={submit}>
                  {step === 1 ? (
                    mode === "create" ? (
                      <div className="field">
                        <label htmlFor="loved-one">Their name</label>
                        <input
                          id="loved-one"
                          value={lovedOne}
                          onChange={(e) => setLovedOne(e.target.value)}
                          autoComplete="off"
                          required
                          maxLength={80}
                          placeholder="e.g. Rosa"
                        />
                        <small>
                          Use the name your family usually calls them.
                        </small>
                      </div>
                    ) : (
                      <div className="field">
                        <label htmlFor="invitation">
                          Invitation link or code
                        </label>
                        <input
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
                      <div className="field">
                        <label htmlFor="your-name">Your name</label>
                        <input
                          id="your-name"
                          required
                          maxLength={80}
                          autoComplete="name"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                        />
                      </div>
                      <div className="field">
                        <label htmlFor="relationship">
                          Your relationship{" "}
                          {lovedOne ? `to ${lovedOne}` : "to your loved one"}
                        </label>
                        <select
                          id="relationship"
                          required
                          value={relationship}
                          onChange={(e) => setRelationship(e.target.value)}
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
                  <div className="row">
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
                    <Button type="submit" className="full" disabled={busy}>
                      {busy ? (
                        <>
                          <span className="spinner" aria-hidden="true" />
                          Setting up…
                        </>
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
              <p
                className="notice notice-error"
                role="alert"
                style={{ marginTop: 20 }}
              >
                {error}
              </p>
            )}
          </>
        )}
      </main>
      <p className="footer-note">
        <Camera size={14} aria-hidden="true" />
        You’ll be asked for camera or microphone access only when you use it.
      </p>
    </div>
  );
}
