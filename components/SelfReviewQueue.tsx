"use client";

import { useCallback, useEffect, useState } from "react";
import { authenticatedFetch, responseJSON } from "@/lib/client-auth";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
import type { PendingContributionRow } from "@/lib/types";

type Pending = Pick<PendingContributionRow, "id" | "kind" | "preview" | "created_at">;

/**
 * Contributors review the wearer's recent stories before they join the graph.
 * Framed as participation rather than gatekeeping: nothing here tells the
 * wearer anything, and an unreviewed story is still kept.
 */
export function SelfReviewQueue({ wearerName, onChanged }: { wearerName?: string; onChanged?: () => Promise<void> }) {
  const [pending, setPending] = useState<Pending[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await responseJSON(await authenticatedFetch("/api/self/review"));
      setPending(data.pending ?? []);
    } catch {
      // A wearer session or a family without a self keeper simply has no queue.
      setPending([]);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const decide = async (id: string, action: "approve" | "reject") => {
    setBusyId(id);
    setError(null);
    try {
      await responseJSON(await authenticatedFetch("/api/self/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      }));
      setPending((rows) => rows.filter((row) => row.id !== id));
      await onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save that decision.");
    } finally {
      setBusyId(null);
    }
  };

  if (!pending.length) return null;

  return (
    <section className="animate-fade-up rounded-2xl border border-primary/25 bg-primary-soft p-5">
      <div className="mb-3 flex items-center gap-2">
        <Sparkles className="h-[18px] w-[18px] text-primary" aria-hidden />
        <h2 className="font-semibold">
          {wearerName ? `${wearerName}'s new stories` : "New stories"}
        </h2>
      </div>
      <p className="mb-4 text-sm text-ink/70">
        Add these to your family memory, or keep them just as a recording.
      </p>
      {error && <p role="alert" className="mb-3 text-sm text-amber-700">{error}</p>}
      <ul className="space-y-3">
        {pending.map((row) => (
          <li key={row.id} className="rounded-xl bg-paper/80 p-4">
            <p className="text-[15px] leading-snug text-ink">“{row.preview}”</p>
            <div className="mt-3 flex gap-2">
              <Button onClick={() => decide(row.id, "approve")} disabled={busyId === row.id}>
                Add to our memory
              </Button>
              <Button
                variant="outline"
                onClick={() => decide(row.id, "reject")}
                disabled={busyId === row.id}
              >
                Just keep the recording
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
