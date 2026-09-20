"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Leaf, Users } from "lucide-react";
import { AuthBoundary, SignOutButton, authenticatedFetch, responseJSON, useKinAuth } from "@/lib/client-auth";
import { MemoryContextCard } from "@/components/MemoryContextCard";
import type { Briefing } from "@/lib/briefing";

export default function PreparePage() { return <AuthBoundary><Prepare /></AuthBoundary>; }
function Prepare() {
  const { familyId, role } = useKinAuth();
  const [briefings,setBriefings] = useState<Briefing[]>([]);
  const [selected,setSelected] = useState<string | null>(null);
  const [state,setState] = useState<"loading"|"ready"|"error">("loading");
  const [attempt,setAttempt] = useState(0);
  useEffect(()=>{
    const controller = new AbortController();
    setState("loading"); setBriefings([]); setSelected(null);
    authenticatedFetch("/api/prepare",{signal:controller.signal}).then(responseJSON).then(data=>{
      if (controller.signal.aborted) return;
      setBriefings(data.briefings); setState("ready");
    }).catch(()=>{if (!controller.signal.aborted) setState("error");});
    return ()=>controller.abort();
  },[familyId,attempt]);
  const current = briefings.find(b=>b.context.person.id===selected);
  return <main className="min-h-screen bg-paper px-4 pb-14 text-ink">
    <header className="mx-auto flex max-w-2xl flex-wrap items-center justify-between gap-3 py-5">
      <Link href="/" className="flex min-h-11 items-center gap-2 text-xl font-semibold text-primary"><Leaf size={22} aria-hidden /> kin</Link><SignOutButton />
    </header>
    <div className="mx-auto max-w-2xl">
      <nav aria-label="Family navigation" className="mb-8 flex flex-wrap gap-5 text-sm text-primary">
        <Link className="inline-flex min-h-11 items-center gap-2 underline-offset-4 hover:underline" href={role === "wearer" ? "/wearer" : "/family"}><ArrowLeft size={15} aria-hidden />{role === "wearer" ? "Back to companion" : "Back to family"}</Link>
        <Link className="inline-flex min-h-11 items-center underline-offset-4 hover:underline" href="/graph">Memory Atlas</Link>
        <Link className="inline-flex min-h-11 items-center underline-offset-4 hover:underline" href="/today">Today</Link>
      </nav>
      <p className="text-sm font-semibold uppercase tracking-widest text-primary">Before you see them</p>
      <h1 className="mt-3 text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">A familiar place to start.</h1>
      <p className="mb-8 mt-4 max-w-lg text-lg leading-relaxed text-ink/65">Choose someone you’re going to see. Take a quiet moment with the memories your family has shared.</p>
      {state === "loading" && <p role="status" className="rounded-2xl border border-ink/10 p-6">Gathering your family’s memories…</p>}
      {state === "error" && <div role="alert" className="rounded-2xl border border-ink/15 p-6"><p>Your family’s memories couldn’t be loaded. Please try again.</p><button className="mt-4 min-h-11 rounded-xl bg-primary px-5 text-white" onClick={()=>setAttempt(n=>n+1)}>Try again</button></div>}
      {state === "ready" && !briefings.length && <div className="rounded-2xl border border-dashed border-ink/20 p-7"><Users className="mb-3 text-primary" aria-hidden /><h2 className="text-xl font-semibold">Your people will appear here.</h2><p className="mt-2 text-ink/65">As your family adds people and stories, you’ll have a little context to return to.</p></div>}
      {briefings.length > 0 && <section aria-label="People in your family" className="mb-7 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {briefings.map(b=><button key={b.context.person.id} aria-pressed={selected===b.context.person.id} onClick={()=>setSelected(b.context.person.id)} className={`flex min-h-24 items-center gap-4 rounded-2xl border p-4 text-left transition-colors ${selected===b.context.person.id ? "border-primary bg-primary-soft" : "border-ink/10 bg-paper-card hover:border-primary/50"}`}>
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-lg text-primary" aria-hidden>{b.context.person.name.slice(0,1)}</span>
          <span className="min-w-0 flex-1"><span className="block break-words text-xl font-semibold">{b.context.person.name}</span><span className="block text-sm text-ink/65">{b.context.person.relationship || "In your family’s memories"}</span></span><ArrowRight size={18} className="shrink-0 text-primary" aria-hidden />
        </button>)}
      </section>}
      <div aria-live="polite" aria-atomic="true" className="sr-only">{current ? `Memories of ${current.context.person.name} selected.` : ""}</div>
      {current?.status === "ready" && <MemoryContextCard key={selected} context={current.context} />}
      {current && current.status !== "ready" && <section className="rounded-3xl border border-primary/15 bg-paper-card p-7"><h2 className="text-3xl font-semibold">{current.context.person.name}</h2>{current.context.person.relationship && <p className="mt-2 text-lg text-ink/65">{current.context.person.relationship}</p>}<p className="mt-5 text-xl leading-relaxed">{current.status === "disputed" ? "These memories need a little care." : "A little more family context is needed."}</p><p className="mt-3 text-ink/65">{current.status === "disputed" ? "The stories include an explicit disagreement. Kin will leave out a memory cue until the family has reviewed it." : "Kin waits for stories from at least two different people before offering a memory here."}</p><Link className="mt-5 inline-block py-2 text-primary underline" href="/graph">Explore the family’s memories</Link></section>}
      {state === "ready" && !current && briefings.length > 0 && <p className="text-center text-sm text-ink/60">Choose a person above. No camera or microphone needed.</p>}
    </div>
  </main>;
}
