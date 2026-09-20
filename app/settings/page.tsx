"use client";
import { useEffect, useState } from "react";
import {
  Copy,
  Check,
  LogOut,
  Users,
  ScanFace,
  Link as LinkIcon,
} from "lucide-react";
import { useFamilyData, initials } from "@/lib/family-data";
import { AppShell, LoadingView, PrivacyNote } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { getAnonClient } from "@/lib/supabase";
export default function Settings() {
  const { data, error, loading, refresh } = useFamilyData();
  const [large, setLarge] = useState(false);
  const [motion, setMotion] = useState(false);
  const [invite, setInvite] = useState("");
  const [lovedInvite, setLovedInvite] = useState("");
  const [lovedCopied, setLovedCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  useEffect(() => {
    try {
      setLarge(localStorage.getItem("kin-large-text") === "true");
      setMotion(localStorage.getItem("kin-reduce-motion") === "true");
    } catch {}
  }, []);
  const preference = (key: string, value: boolean) => {
    try {
      localStorage.setItem(key, String(value));
    } catch {}
    document.documentElement.classList.toggle(key, value);
  };
  const createInvite = async (
    role: "contributor" | "loved_one" = "contributor",
  ) => {
    setBusy(true);
    setActionError(null);
    try {
      const r = await fetch("/api/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      const url = `${window.location.origin}/onboarding?invite=${j.token}`;
      if (role === "loved_one") {
        setLovedInvite(url);
        setLovedCopied(false);
      } else {
        setInvite(url);
        setCopied(false);
      }
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Try again.");
    } finally {
      setBusy(false);
    }
  };
  const copy = async (forLovedOne = false) => {
    try {
      await navigator.clipboard.writeText(forLovedOne ? lovedInvite : invite);
      if (forLovedOne) setLovedCopied(true);
      else setCopied(true);
    } catch {
      setActionError("Select and copy the invitation link below.");
    }
  };
  const me = data?.relatives.find((r) => r.id === data.relativeId);
  const isLovedOne = data?.role === "loved_one";
  const displayName = isLovedOne ? data?.wearer.name : me?.name;
  return (
    <AppShell data={data} className="settings-main">
      {loading ? (
        <LoadingView />
      ) : !data ? (
        <div className="empty-state">
          <h1>Let’s reconnect.</h1>
          <p role="alert">{error}</p>
          <Button onClick={refresh}>Try again</Button>
        </div>
      ) : (
        <>
          <header className="page-header">
            <div>
              <h1>Settings</h1>
              <p className="muted">Your account and preferences.</p>
            </div>
          </header>
          <section
            className="panel settings-section"
            aria-labelledby="account-heading"
          >
            <div className="settings-summary">
              <span className="avatar avatar-lg">
                {initials(displayName ?? "You")}
              </span>
              <div>
                <h2 id="account-heading">{displayName}</h2>
                <p>{data.email}</p>
              </div>
            </div>
            <div className="divider" style={{ marginTop: 24 }} />
            <div className="setting-row">
              <div>
                <strong>{data.wearer.name}’s family</strong>
                <small>
                  {isLovedOne
                    ? "Your recognition account"
                    : `${me?.relation_to_wearer} · ${data.isOwner ? "Family organizer" : "Family member"}`}
                </small>
              </div>
              <span className="pill">
                <Users aria-hidden="true" />
                {data.relatives.length}{" "}
                {data.relatives.length === 1 ? "member" : "members"}
              </span>
            </div>
          </section>
          {data.isOwner && (
            <section
              className="panel settings-section"
              aria-labelledby="loved-one-heading"
            >
              <div className="row" style={{ marginBottom: 14 }}>
                <ScanFace size={22} aria-hidden="true" />
                <h2 id="loved-one-heading">{data.wearer.name}’s account</h2>
              </div>
              {data.lovedOneConnected ? (
                <p className="notice notice-success">
                  <Check
                    size={16}
                    style={{ display: "inline", marginRight: 8 }}
                    aria-hidden="true"
                  />
                  {data.wearer.name} is connected. Their account opens directly
                  to recognition.
                </p>
              ) : (
                <>
                  <p className="muted small" style={{ marginBottom: 20 }}>
                    Invite {data.wearer.name} to use Kin on their own phone.
                    They’ll get the simple recognition screen while your family
                    manages the memories.
                  </p>
                  <Button
                    onClick={() => createInvite("loved_one")}
                    disabled={busy}
                  >
                    {busy
                      ? "Creating invitation…"
                      : `Invite ${data.wearer.name}`}
                  </Button>
                  {lovedInvite && (
                    <div className="stack" style={{ marginTop: 20 }}>
                      <p
                        className="invite-output"
                        aria-label={`Invitation for ${data.wearer.name}`}
                      >
                        {lovedInvite}
                      </p>
                      <Button variant="outline" onClick={() => copy(true)}>
                        {lovedCopied ? (
                          <Check aria-hidden="true" />
                        ) : (
                          <Copy aria-hidden="true" />
                        )}
                        {lovedCopied
                          ? "Copied"
                          : `Copy ${data.wearer.name}’s invitation`}
                      </Button>
                      <p className="small muted" role="status">
                        Open this link on {data.wearer.name}’s phone to create
                        their account or sign in. Share it only with{" "}
                        {data.wearer.name}; it can be used once and expires in 7
                        days.
                      </p>
                    </div>
                  )}
                </>
              )}
            </section>
          )}
          <section
            className="panel settings-section"
            aria-labelledby="access-heading"
          >
            <h2
              id="access-heading"
              style={{ fontSize: "1.2rem", marginBottom: 24 }}
            >
              Accessibility
            </h2>
            <div className="setting-row">
              <label htmlFor="large-text">
                Larger text
                <small>Increase text size. Browser zoom works, too.</small>
              </label>
              <input
                className="toggle"
                id="large-text"
                type="checkbox"
                role="switch"
                checked={large}
                onChange={(e) => {
                  setLarge(e.target.checked);
                  preference("kin-large-text", e.target.checked);
                }}
              />
            </div>
            <div className="setting-row">
              <label htmlFor="reduce-motion">
                Less motion
                <small>
                  Keep transitions still. Kin also respects your device’s motion
                  settings.
                </small>
              </label>
              <input
                className="toggle"
                id="reduce-motion"
                type="checkbox"
                role="switch"
                checked={motion}
                onChange={(e) => {
                  setMotion(e.target.checked);
                  preference("kin-reduce-motion", e.target.checked);
                }}
              />
            </div>
          </section>
          {!isLovedOne && (
            <section
              className="panel settings-section invite-card"
              aria-labelledby="invite-heading"
            >
              <div className="row" style={{ marginBottom: 14 }}>
                <Users size={22} aria-hidden="true" />
                <h2 id="invite-heading" style={{ fontSize: "1.2rem" }}>
                  Family sharing
                </h2>
              </div>
              <p className="muted small" style={{ marginBottom: 22 }}>
                Invite another relative to share their own photos, stories, and
                memories of {data.wearer.name}.
              </p>
              {data.isOwner ? (
                <>
                  <Button
                    variant="outline"
                    onClick={() => createInvite()}
                    disabled={busy}
                  >
                    {busy ? (
                      <span className="spinner" aria-hidden="true" />
                    ) : (
                      <LinkIcon aria-hidden="true" />
                    )}
                    {busy ? "Creating invitation…" : "Create invitation link"}
                  </Button>
                  {invite && (
                    <div className="stack" style={{ marginTop: 20 }}>
                      <p className="invite-output">{invite}</p>
                      <Button onClick={() => copy()}>
                        {copied ? (
                          <Check aria-hidden="true" />
                        ) : (
                          <Copy aria-hidden="true" />
                        )}
                        {copied ? "Copied" : "Copy invitation"}
                      </Button>
                      <p className="small muted" role="status">
                        Anyone you share this link with can join your family for
                        the next 7 days.
                      </p>
                    </div>
                  )}
                </>
              ) : (
                <p className="notice">
                  Your family organizer can create an invitation for you to
                  share.
                </p>
              )}
              {actionError && (
                <p
                  className="notice notice-error"
                  role="alert"
                  style={{ marginTop: 15 }}
                >
                  {actionError}
                </p>
              )}
            </section>
          )}
          {isLovedOne && actionError && (
            <p className="notice notice-error" role="alert">
              {actionError}
            </p>
          )}
          <Button
            variant="ghost"
            onClick={async () => {
              const { error } = await getAnonClient()!.auth.signOut();
              if (error) {
                setActionError("Could not sign out. Please try again.");
                return;
              }
              window.location.assign("/signin");
            }}
          >
            <LogOut aria-hidden="true" />
            Sign out
          </Button>
          <PrivacyNote />
        </>
      )}
    </AppShell>
  );
}
