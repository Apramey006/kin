"use client";
import { useState } from "react";
import { MessageCircle, ArrowRight } from "lucide-react";
import { Recorder } from "./Recorder";
import { Sheet } from "./Sheet";
import { Button } from "./ui/button";
import type { Relative, WeaverQuestionRow } from "@/lib/types";
export function WeaverInbox({
  me,
  relatives,
  questions,
  onAnswered,
  onOpenChange,
}: {
  me: Relative;
  relatives: Relative[];
  questions: WeaverQuestionRow[];
  onAnswered: () => void;
  onOpenChange?: (open: boolean) => void;
}) {
  const [selected, setSelected] = useState<WeaverQuestionRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  const own = questions.filter(
    (q) => q.target_relative_id === me.id && q.status === "open",
  );
  const answer = async (blob: Blob, mime: string) => {
    if (!selected) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append(
        "file",
        new File([blob], `answer.${mime.includes("mp4") ? "m4a" : "webm"}`, {
          type: mime,
        }),
      );
      fd.append("contributor_id", me.id);
      fd.append("question_id", selected.id);
      const r = await fetch("/api/weaver/answer", { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Your answer couldn’t be saved.");
      setSelected(null);
      onOpenChange?.(false);
      setSuccess(true);
      onAnswered();
      return true;
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      {success && (
        <p
          className="notice notice-success"
          role="status"
          style={{ marginBottom: 20 }}
        >
          Your answer is saved.
        </p>
      )}
      {own.map((q) => (
        <section className="prompt-card" key={q.id}>
          <div className="eyebrow">
            <MessageCircle aria-hidden="true" />
            Question for you
          </div>
          <h2>Do you remember?</h2>
          <p>{q.question_text}</p>
          <Button onClick={() => { setSelected(q); onOpenChange?.(true); }}>
            Share what you remember
            <ArrowRight aria-hidden="true" />
          </Button>
        </section>
      ))}
      <Sheet
        open={!!selected}
        onClose={() => { setSelected(null); onOpenChange?.(false); }}
        title="Record an answer"
        busy={busy}
      >
        {selected && (
          <>
            <p className="sheet-intro">{selected.question_text}</p>
            <Recorder
              onRecorded={answer}
              disabled={busy}
              label="Record your answer"
            />
            {selected.evidence?.length > 0 && (
              <details style={{ marginTop: 20 }}>
                <summary>What your family has shared</summary>
                {selected.evidence.map((e) => (
                  <p className="source-evidence small" key={e.memory_id}>
                    <strong>
                      {relatives.find((r) => r.id === e.contributor_id)?.name ??
                        "A relative"}
                    </strong>
                    : {e.summary}
                  </p>
                ))}
              </details>
            )}
          </>
        )}
      </Sheet>
    </>
  );
}
