"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AuthBoundary, SignOutButton, useKinAuth } from "@/lib/client-auth";
import { getAnonClient } from "@/lib/supabase";
import { recordedMatches, type RecordedCheck } from "@/lib/reflection";
import { relationshipText } from "@/lib/briefing";
import type { GraphNodeRow } from "@/lib/types";

export default function TodayPage() { return <AuthBoundary><Today /></AuthBoundary>; }
function Today() {
  const { familyId } = useKinAuth();
  const [matches,setMatches] = useState<ReturnType<typeof recordedMatches>>([]);
  const [state,setState] = useState<"loading"|"ready"|"error">("loading");
  const [date,setDate] = useState("");
  const [attempt,setAttempt] = useState(0);
  useEffect(()=>{
    let active=true;
    setState("loading"); setMatches([]);
    const sb=getAnonClient();
    if(!sb) {setState("error"); return;}
    const from=new Date();from.setHours(0,0,0,0);
    const to=new Date(from);to.setDate(to.getDate()+1);
    setDate(from.toLocaleDateString(undefined,{month:"long",day:"numeric"}));
    Promise.all([
      sb.from("recall_events").select("id,family_id,status,face_outcome,created_at").eq("family_id",familyId)
        .gte("created_at",from.toISOString()).lt("created_at",to.toISOString()).order("created_at",{ascending:false}).limit(100),
      sb.from("graph_nodes").select("*").eq("family_id",familyId).eq("type","person"),
    ]).then(([events,nodes])=>{
      if(!active)return;
      if(events.error||nodes.error){setState("error");return;}
      setMatches(recordedMatches(familyId,from,to,events.data as RecordedCheck[],nodes.data as GraphNodeRow[]));setState("ready");
    }).catch(()=>{if(active)setState("error");});
    return ()=>{active=false;};
  },[familyId,attempt]);
  return <main className="min-h-screen bg-paper px-4 py-6 text-ink"><div className="mx-auto max-w-2xl">
    <header className="mb-10 flex flex-wrap items-center justify-between gap-4"><Link className="py-2 text-primary underline underline-offset-4" href="/prepare">Before you see them</Link><SignOutButton /></header>
    <p className="text-sm font-semibold uppercase tracking-widest text-primary">A moment to reflect · {date}</p>
    <h1 className="mt-3 text-4xl font-semibold">Today, with Kin.</h1>
    <p className="mb-7 mt-4 text-lg leading-relaxed text-ink/65">A record of camera checks saved by your family. A match doesn’t confirm that you met or had a conversation.</p>
    {state==="loading"&&<p role="status">Looking back at today…</p>}
    {state==="error"&&<p role="alert">Today’s checks couldn’t be loaded. Please try again.</p>}
    {state==="ready"&&!matches.length&&<div className="rounded-2xl border border-ink/10 bg-paper-card p-6"><h2 className="text-xl font-semibold">No saved matches to revisit today.</h2><p className="mt-2 text-ink/65">Your family’s memories are still here whenever you want a little context.</p><Link className="mt-4 inline-block py-2 text-primary underline" href="/prepare">Explore familiar people</Link></div>}
    <ol className="space-y-4">{matches.map(match=><li key={match.id} className="rounded-2xl border border-primary/15 bg-paper-card p-6">
      <time dateTime={match.at} className="text-sm text-ink/65">{new Date(match.at).toLocaleTimeString(undefined,{hour:"numeric",minute:"2-digit"})}</time>
      <h2 className="mt-2 text-2xl font-semibold">A camera check matched {match.person.label}.</h2>
      {relationshipText(match.person.relation_to_wearer)&&<p className="mt-2 text-ink/65">{relationshipText(match.person.relation_to_wearer)} · as recorded by your family</p>}
      <p className="mt-3 text-sm text-ink/65">{match.cueAvailable?"Kin offered a family memory at the time.":"Kin stayed quiet because a memory cue wasn’t available."}</p>
      <Link className="mt-3 inline-block min-h-11 py-2 text-primary underline" href="/prepare">Revisit family context</Link>
    </li>)}</ol>
    <button className="mt-6 min-h-11 rounded-xl border border-primary/30 px-5 text-primary" onClick={()=>setAttempt(n=>n+1)} disabled={state==="loading"}>Refresh today</button>
    <p className="mt-4 text-sm text-ink/60">Based on the latest 100 checks today, using this device’s local date. Nothing here is saved as a new memory.</p>
  </div></main>;
}
