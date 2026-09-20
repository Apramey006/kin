"use client";

import { useEffect, useState } from "react";
import { getAnonClient, FAMILY_ID } from "@/lib/supabase";
import { Recorder } from "@/components/Recorder";
import { Sparkles } from "lucide-react";
import type { Relative, WeaverQuestionRow } from "@/lib/types";

export function WeaverInbox({
  me,
  relatives,
}: {
  me: Relative;
  relatives: Relative[];
}) {
  const [questions, setQuestions] = useState<WeaverQuestionRow[]>([]);
  const [answered, setAnswered] = useState<Record<string, string>>({});
  const [submittingId, setSubmittingId] = useState<string | null>(null);

  useEffect(() => {
    const sb = getAnonClient();
    if (!sb) return;
    let cancelled = false;
    const load = async () => {
      const { data } = await sb
        .from("weaver_questions")
        .select("*")
        .eq("family_id", FAMILY_ID)
        .eq("target_relative_id", me.id)
        .eq("status", "open")
        .order("created_at", { ascending: false });
      if (!cancelled) setQuestions((data ?? []) as WeaverQuestionRow[]);
    };
    load();
    const channel = sb
      .channel("weaver-inbox")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "weaver_questions",
          filter: `family_id=eq.${FAMILY_ID}`,
        },
        () => load()
      )
      .subscribe();
    return () => {
      cancelled = true;
      sb.removeChannel(channel);
    };
  }, [me.id]);

  if (!questions.length) return null;

  const nameOf = (id: string) =>
    relatives.find((r) => r.id === id)?.name ?? "Someone";

  const answer = async (q: WeaverQuestionRow, blob: Blob, mime: string) => {
    setSubmittingId(q.id);
    try {
      const fd = new FormData();
      fd.append("file", new File([blob], "answer." + (mime.includes("mp4") ? "m4a" : "webm"), { type: mime }));
      fd.append("contributor_id", me.id);
      fd.append("question_id", q.id);
      const res = await fetch("/api/weaver/answer", { method: "POST", body: fd });
      const json = await res.json();
      if (res.ok) {
        setAnswered((a) => ({ ...a, [q.id]: json.summary }));
        setQuestions((qs) => qs.filter((x) => x.id !== q.id));
      }
    } finally {
      setSubmittingId(null);
    }
  };

  return (
    <section className="animate-fade-up rounded-2xl border border-primary/25 bg-primary-soft p-5">
      <div className="mb-3 flex items-center gap-2">
        <Sparkles className="h-[18px] w-[18px] text-primary" aria-hidden />
        <h2 className="text-lg font-semibold text-primary-deep">Kin is asking you</h2>
        <span className="ml-auto rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
          {questions.length}
        </span>
      </div>
      <div className="space-y-3">
        {questions.map((q) => (
          <div
            key={q.id}
            className="rounded-xl border border-ink/[0.06] bg-paper-card p-4 shadow-soft"
          >
            <p className="mb-2 text-lg leading-snug">{q.question_text}</p>
            {q.evidence?.length > 0 && (
              <ul className="mb-3 space-y-1 border-l-2 border-ink/10 pl-3 text-sm text-ink/55">
                {q.evidence.map((e) => (
                  <li key={e.memory_id}>
                    <span className="font-medium text-ink/75">
                      {nameOf(e.contributor_id)}
                    </span>
                    : {e.summary}
                  </li>
                ))}
              </ul>
            )}
            {answered[q.id] ? (
              <p className="text-primary">Thank you. Kin added: {answered[q.id]}</p>
            ) : (
              <>
                <Recorder
                  label="Record answer"
                  disabled={submittingId === q.id}
                  onRecorded={(b, m) => answer(q, b, m)}
                />
                {submittingId === q.id && (
                  <p className="mt-2 flex items-center gap-2 text-ink/55">
                    <span className="kin-pulse h-2 w-2 rounded-full bg-primary" />
                    Adding your answer…
                  </p>
                )}
              </>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
