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
import { Brand } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAnonClient } from "@/lib/supabase";

const noticeError =
  "rounded-xl border border-amber-600/30 bg-amber-50 px-4 py-3 text-sm text-amber-800";
const noticeOk =
  "rounded-xl border border-primary/30 bg-primary-soft px-4 py-3 text-sm text-primary-deep";
const inviteOutput =
  "break-all rounded-xl bg-ink/5 px-4 py-3 font-mono text-sm text-ink";

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
    <main className="min-h-screen bg-paper text-ink">
      <div className="mx-auto max-w-2xl px-4 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <Brand />
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              const { error } = await getAnonClient()!.auth.signOut();
              if (error) {
                setActionError("Could not sign out. Please try again.");
                return;
              }
              window.location.assign("/signin");
            }}
          >
            <LogOut aria-hidden="true" className="h-4 w-4" />
            Sign out
          </Button>
        </div>
        {loading ? (
          <p className="text-ink/60" role="status">
            Loading your family…
          </p>
        ) : !data ? (
          <Card>
            <CardHeader>
              <CardTitle>Let’s reconnect.</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p role="alert" className={noticeError}>
                {error}
              </p>
              <Button onClick={refresh}>Try again</Button>
            </CardContent>
          </Card>
        ) : (
          <>
            <header>
              <h1 className="text-2xl font-semibold">Settings</h1>
              <p className="text-ink/60">Your account and preferences.</p>
            </header>
            <Card>
              <CardContent className="pt-6 space-y-5">
                <div className="flex items-center gap-4">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft text-primary font-semibold">
                    {initials(displayName ?? "You")}
                  </span>
                  <div>
                    <h2 className="font-semibold">{displayName}</h2>
                    <p className="text-sm text-ink/55">{data.email}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between border-t border-ink/10 pt-5">
                  <div>
                    <strong>{data.wearer.name}’s family</strong>
                    <small className="block text-ink/55">
                      {isLovedOne
                        ? "Your recognition account"
                        : `${me?.relation_to_wearer} · ${data.isOwner ? "Family organizer" : "Family member"}`}
                    </small>
                  </div>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-soft px-3 py-1 text-sm text-primary">
                    <Users aria-hidden="true" className="h-4 w-4" />
                    {data.relatives.length}{" "}
                    {data.relatives.length === 1 ? "member" : "members"}
                  </span>
                </div>
              </CardContent>
            </Card>
            {data.isOwner && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ScanFace size={22} aria-hidden="true" />
                    {data.wearer.name}’s account
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {data.lovedOneConnected ? (
                    <p className={noticeOk}>
                      <Check
                        size={16}
                        style={{ display: "inline", marginRight: 8 }}
                        aria-hidden="true"
                      />
                      {data.wearer.name} is connected. Their account opens
                      directly to recognition.
                    </p>
                  ) : (
                    <div className="space-y-4">
                      <p className="text-sm text-ink/60">
                        Invite {data.wearer.name} to use Kin on their own phone.
                        They’ll get the simple recognition screen while your
                        family manages the memories.
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
                        <div className="space-y-3">
                          <p
                            className={inviteOutput}
                            aria-label={`Invitation for ${data.wearer.name}`}
                          >
                            {lovedInvite}
                          </p>
                          <Button variant="outline" onClick={() => copy(true)}>
                            {lovedCopied ? (
                              <Check aria-hidden="true" className="h-4 w-4" />
                            ) : (
                              <Copy aria-hidden="true" className="h-4 w-4" />
                            )}
                            {lovedCopied
                              ? "Copied"
                              : `Copy ${data.wearer.name}’s invitation`}
                          </Button>
                          <p className="text-sm text-ink/55" role="status">
                            Open this link on {data.wearer.name}’s phone to
                            create their account or sign in. Share it only with{" "}
                            {data.wearer.name}; it can be used once and expires
                            in 7 days.
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            <Card>
              <CardHeader>
                <CardTitle>Accessibility</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="flex items-center justify-between gap-4">
                  <label htmlFor="large-text">
                    Larger text
                    <small className="block text-ink/55">
                      Increase text size. Browser zoom works, too.
                    </small>
                  </label>
                  <input
                    className="h-5 w-5 accent-primary"
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
                <div className="flex items-center justify-between gap-4">
                  <label htmlFor="reduce-motion">
                    Less motion
                    <small className="block text-ink/55">
                      Keep transitions still. Kin also respects your device’s
                      motion settings.
                    </small>
                  </label>
                  <input
                    className="h-5 w-5 accent-primary"
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
              </CardContent>
            </Card>
            {!isLovedOne && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users size={22} aria-hidden="true" />
                    Family sharing
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-ink/60">
                    Invite another relative to share their own photos, stories,
                    and memories of {data.wearer.name}.
                  </p>
                  {data.isOwner ? (
                    <>
                      <Button
                        variant="outline"
                        onClick={() => createInvite()}
                        disabled={busy}
                      >
                        <LinkIcon aria-hidden="true" className="h-4 w-4" />
                        {busy ? "Creating invitation…" : "Create invitation link"}
                      </Button>
                      {invite && (
                        <div className="space-y-3">
                          <p className={inviteOutput}>{invite}</p>
                          <Button onClick={() => copy()}>
                            {copied ? (
                              <Check aria-hidden="true" className="h-4 w-4" />
                            ) : (
                              <Copy aria-hidden="true" className="h-4 w-4" />
                            )}
                            {copied ? "Copied" : "Copy invitation"}
                          </Button>
                          <p className="text-sm text-ink/55" role="status">
                            Anyone you share this link with can join your family
                            for the next 7 days.
                          </p>
                        </div>
                      )}
                    </>
                  ) : (
                    <p className={noticeOk}>
                      Your family organizer can create an invitation for you to
                      share.
                    </p>
                  )}
                  {actionError && (
                    <p className={noticeError} role="alert">
                      {actionError}
                    </p>
                  )}
                </CardContent>
              </Card>
            )}
            {isLovedOne && actionError && (
              <p className={noticeError} role="alert">
                {actionError}
              </p>
            )}
            <p className="text-center text-sm text-ink/40">
              Your memories stay private to your family.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
