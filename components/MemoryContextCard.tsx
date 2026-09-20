"use client";

import Link from "next/link";
import { BookOpen, Heart, ShieldCheck } from "lucide-react";
import type { MemoryContext } from "@/lib/briefing";

export function MemoryContextCard({ context }: { context: MemoryContext }) {
  const [anchor, ...more] = context.facts;
  if (!anchor) return null;
  const names = context.supporters.map(name=>name==="You"?"you":name).join(context.supporters.length === 2 ? " and " : ", ");
  return <article className="rounded-3xl border border-primary/15 bg-paper-card p-6 text-ink shadow-soft sm:p-8" aria-label={`Memories of ${context.person.name}`}>
    <p className="mb-5 flex items-center gap-2 text-sm font-medium text-primary"><Heart size={16} aria-hidden />{context.mode === "prepare" ? "A little context, before you meet" : "A familiar face"}</p>
    <h2 className="break-words text-4xl font-semibold tracking-tight">{context.person.name}</h2>
    {context.person.relationship && <p className="mt-2 text-xl text-ink/65">{context.person.relationship}</p>}
    <div className="my-7 border-l-2 border-primary/35 pl-5">
      <p className="mb-2 text-sm font-semibold text-primary">{anchor.speaker === "You" ? "You shared" : `${anchor.speaker} remembers`}</p>
      <blockquote className="break-words text-2xl leading-relaxed">“{anchor.text}”</blockquote>
    </div>
    <p className="text-sm leading-relaxed text-ink/65">Memories about {context.person.name} from {names}.</p>
    <div className="mt-6 divide-y divide-ink/10 border-t border-ink/10">
      <details className="py-3">
        <summary className="min-h-11 cursor-pointer py-2 font-semibold text-primary">More context</summary>
        <div className="space-y-5 pb-3 pt-2">
          {more.length ? more.map(f => <figure key={`${f.memoryId}:${f.id}`} className="border-l-2 border-primary/15 pl-4">
            <figcaption className="text-sm font-semibold text-primary">{f.speaker === "You" ? "You shared" : `${f.speaker} remembers`}</figcaption>
            <blockquote className="mt-1 break-words text-lg leading-relaxed">“{f.text}”</blockquote>
            <Link className="mt-2 inline-flex min-h-11 items-center gap-2 text-sm underline underline-offset-4" href={`/graph?memory=${encodeURIComponent(f.memoryId)}`}><BookOpen size={14} aria-hidden /> View source in Atlas</Link>
          </figure>) : <p className="text-ink/65">This is the short memory Kin selected for now.</p>}
          <details className="rounded-xl bg-paper-deep p-4">
            <summary className="cursor-pointer font-medium">Read {anchor.speaker === "You" ? "your" : `${anchor.speaker}’s`} original words</summary>
            <p className="mt-3 whitespace-pre-wrap break-words text-base leading-relaxed">{anchor.sourceText}</p>
            <Link className="mt-3 inline-block py-2 text-sm underline" href={`/graph?memory=${encodeURIComponent(anchor.memoryId)}`}>View source in Atlas</Link>
          </details>
        </div>
      </details>
      <details className="py-3">
        <summary className="min-h-11 cursor-pointer py-2 font-semibold text-primary">Why this?</summary>
        <div className="space-y-3 pb-2 text-base leading-relaxed text-ink/70">
          <p className="flex items-start gap-2"><ShieldCheck size={18} className="mt-1 shrink-0 text-primary" aria-hidden />{context.mode === "prepare" ? `You selected ${context.person.name}. This is family context, not a camera identification.` : `Kin recognized ${context.person.name} and found supporting memories from independent contributors.`}</p>
          <p>{context.memoryCount} {context.memoryCount === 1 ? "memory" : "memories"} · {context.supporters.length} contributors. The quoted words come from their stories or written captions, not an AI description.</p>
          <p>No explicit contradiction was flagged in this evidence. Family memories can still be incomplete.</p>
          {context.person.relationship && <p>The relationship is the one recorded in your family’s graph.</p>}
          <p>These sources support context about {context.person.name}; they do not necessarily confirm every detail of one another’s stories.</p>
        </div>
      </details>
    </div>
  </article>;
}
