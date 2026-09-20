"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { authenticatedFetch, responseJSON, useKinAuth } from "@/lib/client-auth";

export function FamilyGap({ revision }: { revision: number }) {
  const { familyId }=useKinAuth();
  const [preview,setPreview]=useState<{question:string;targetName:string|null;state:string}|null>(null);
  useEffect(()=>{
    const controller=new AbortController(); setPreview(null);
    authenticatedFetch("/api/weaver/preview",{signal:controller.signal}).then(responseJSON).then(data=>{
      if(!controller.signal.aborted) setPreview(data.preview);
    }).catch(()=>{}); // Optional suggestion; contribution forms remain available on failure.
    return ()=>controller.abort();
  },[familyId,revision]);
  if(!preview) return null;
  return <section className="rounded-2xl border border-primary/20 bg-primary-soft p-5">
    <p className="text-sm font-semibold text-primary">Kin noticed a gap</p>
    <h2 className="mt-2 text-xl font-semibold leading-relaxed">{preview.question}</h2>
    <p className="mt-2 text-sm leading-relaxed text-ink/65">{preview.state==="asked" ? `This question is waiting for ${preview.targetName??"a family member"}.` : `${preview.targetName??"Someone in the family"} may have more context. This is a suggestion; no question has been sent.`}</p>
    <Link className="mt-3 inline-block min-h-11 py-2 text-primary underline underline-offset-4" href="/graph">Explore the family’s story</Link>
  </section>;
}
