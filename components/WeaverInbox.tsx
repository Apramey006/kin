"use client";

import { useEffect, useState } from "react";
import { getAnonClient, FAMILY_ID } from "@/lib/supabase";
import { Recorder } from "@/components/Recorder";
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
  };

  return (
    <section className="rounded-2xl border-2 border-primary/40 bg-primary/5 p-5">
      <h2 className="text-xl font-semibold mb-3">Kin is asking you</h2>
      {questions.map((q) => (
        <div key={q.id} className="rounded-xl bg-white p-4 mb-3 shadow-sm">
          <p className="text-lg mb-2">{q.question_text}</p>
          {q.evidence?.length > 0 && (
            <ul className="text-sm text-ink/60 mb-3 space-y-1">
              {q.evidence.map((e) => (
                <li key={e.memory_id}>
                  <span className="font-medium">{nameOf(e.contributor_id)}</span>
                  : {e.summary}
                </li>
              ))}
            </ul>
          )}
          {answered[q.id] ? (
            <p className="text-primary">Thank you. Kin added: {answered[q.id]}</p>
          ) : (
            <Recorder label="Record answer" onRecorded={(b, m) => answer(q, b, m)} />
          )}
        </div>
      ))}
    </section>
  );
}
