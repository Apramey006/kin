"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import Link from "next/link";
import { getAnonClient } from "./supabase";

type Membership = { familyId: string; contributorId: string | null; admin: boolean; role: string };
const MembershipContext = createContext<Membership | null>(null);

export function useKinAuth(): Membership {
  const membership = useContext(MembershipContext);
  if (!membership) throw new Error("A Kin session is required.");
  return membership;
}

export async function authenticatedFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const sb = getAnonClient();
  const { data, error } = sb ? await sb.auth.getSession() : { data: { session: null }, error: null };
  if (error || !data.session) throw new Error("Please sign in again before continuing.");
  const headers = new Headers(init.headers);
  if (typeof data.session.user.app_metadata.kin_family_id === "string")
    headers.set("Authorization", `Bearer ${data.session.access_token}`);
  return fetch(input, { ...init, headers });
}

export async function responseJSON(response: Response) {
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(typeof body?.error === "string" ? body.error : `Request failed (${response.status}). Please retry.`);
  if (!body) throw new Error("The server returned an incomplete response. Please retry.");
  return body;
}

/** Same bytes and fields retain the same key after a network retry. */
export async function contributionKey(blob: Blob, fields: unknown): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return "web-" + Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("") + "-" +
    Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(fields)))), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function SignOutButton() {
  return <button className="rounded-xl border px-3 py-2 text-sm" onClick={() => getAnonClient()?.auth.signOut()}>Sign out</button>;
}

export function AuthBoundary({ children, contributorOnly = false }: { children: ReactNode; contributorOnly?: boolean }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const sb = getAnonClient();
    if (!sb) { setError("Kin is not configured yet."); setLoading(false); return; }
    let active = true;
    sb.auth.getSession().then(({ data, error: failure }) => {
      if (!active) return;
      setSession(data.session); setLoading(false);
      if (failure) setError("Please sign in again.");
    });
    const { data } = sb.auth.onAuthStateChange((_event, next) => { if (active) { setSession(next); setLoading(false); } });
    return () => { active = false; data.subscription.unsubscribe(); };
  }, []);
  const [account, setAccount] = useState<Membership | null>(null);
  useEffect(() => {
    if (!session) { setAccount(null); return; }
    let active=true;
    fetch("/api/account").then(responseJSON).then(data => {
      const m=data.membership;
      if(active && m) setAccount({familyId:m.family_id,contributorId:m.relative_id,
        role:m.role === "loved_one" ? "wearer" : "contributor",admin:false});
    }).catch(()=>{});
    return ()=>{active=false};
  },[session]);
  const claims = session?.user.app_metadata;
  if(account && typeof claims?.kin_family_id !== "string") {
    if(contributorOnly && account.role === "wearer") return <main className="p-8"><Link href="/wearer">Open recognition</Link></main>;
    return <MembershipContext.Provider key={session?.user.id} value={account}>{children}</MembershipContext.Provider>;
  }
  if (session && typeof claims?.kin_family_id === "string" && (typeof claims?.kin_contributor_id === "string" || claims?.kin_role === "wearer")) {
    if (contributorOnly && claims.kin_role === "wearer") return <main className="p-8 space-y-4"><h1>Welcome, Rosa</h1><Link className="block underline" href="/wearer">Open recognition</Link><SignOutButton /></main>;
    return <MembershipContext.Provider key={session.user.id} value={{ familyId: claims.kin_family_id, contributorId: claims.kin_role === "wearer" ? null : claims.kin_contributor_id, admin: claims.kin_role !== "wearer" && claims.kin_admin === true, role: claims.kin_role ?? "contributor" }}>{children}</MembershipContext.Provider>;
  }
  return <main className="min-h-screen bg-paper flex items-center justify-center p-6 text-ink">
    <form className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-sm" onSubmit={async (event) => {
      event.preventDefault(); if (busy) return;
      setBusy(true); setError(null);
      try {
        const sb = getAnonClient(); if (!sb) throw new Error("Kin is not configured yet.");
        const { error: failure } = await sb.auth.signInWithPassword({ email, password });
        if (failure) throw new Error("Could not sign in. Check your demo account details.");
        setPassword("");
      } catch (failure) { setError(failure instanceof Error ? failure.message : "Sign in failed."); }
      finally { setBusy(false); }
    }}>
      <h1 className="text-2xl font-semibold text-primary">Welcome to Kin</h1>
      <p>Sign in with your provisioned family demo account.</p>
      {loading ? <p role="status">Checking your session…</p> : session ? <><p role="alert">This account has no family membership. Ask the demo owner to provision it.</p><SignOutButton /></> : <>
        <label className="block">Email<input className="mt-1 w-full rounded-xl border p-3" type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
        <label className="block">Password<input className="mt-1 w-full rounded-xl border p-3" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        <button className="w-full rounded-xl bg-primary p-3 text-white disabled:opacity-50" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
      </>}
      {error && <p role="alert" className="text-amber-700">{error}</p>}
    </form>
  </main>;
}
