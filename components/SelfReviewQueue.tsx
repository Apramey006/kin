"use client";

import { useCallback, useEffect, useState } from "react";
import { authenticatedFetch, responseJSON } from "@/lib/client-auth";
import { Button } from "@/components/ui/button";
import { Mic, Check } from "lucide-react";
import { Sheet } from "./Sheet";
import type { PendingContributionRow } from "@/lib/types";

type Pending = Pick<PendingContributionRow, "id" | "kind" | "preview" | "created_at">;

/**
 * Contributors review the wearer's recent stories before they join the graph.
 * Framed as participation rather than gatekeeping: nothing here tells the
 * wearer anything, and an unreviewed story is still kept.
 */
export function SelfReviewQueue({ wearerName, onChanged }: { wearerName?: string; onChanged?: () => Promise<void> }) {
  const [pending, setPending] = useState<Pending[]>([]);
  const [open, setOpen] = useState(false);
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

  if (!pending.length && !open) return null;
  const title = wearerName ? `${wearerName}’s new stories` : "New family stories";
  return (
    <>
      <section className="review-summary" aria-label="Stories awaiting review">
        <span className="review-symbol"><Mic aria-hidden="true" /></span>
        <div>
          <h2>{title}</h2>
          <p>{pending.length ? `${pending.length} ${pending.length === 1 ? "recording" : "recordings"} ready to review` : "You’re all caught up."}</p>
        </div>
        <Button variant="ghost" onClick={() => setOpen(true)} aria-haspopup="dialog">Review</Button>
      </section>
      <Sheet open={open} onClose={() => setOpen(false)} title={title} busy={!!busyId}>
        {error && <p role="alert" className="notice notice-error">{error}</p>}
        {pending.length ? <>
          <p className="sheet-intro">Choose which stories to add to your family’s shared memories. Every recording is kept.</p>
          <ul className="review-list">
            {pending.map((row) => (
              <li key={row.id}>
                <blockquote>“{row.preview}”</blockquote>
                <div className="review-actions">
                  <Button onClick={() => decide(row.id, "approve")} disabled={!!busyId}>Add to our memory</Button>
                  <Button variant="outline" onClick={() => decide(row.id, "reject")} disabled={!!busyId}>Just keep the recording</Button>
                </div>
              </li>
            ))}
          </ul>
        </> : <div className="review-complete" role="status">
          <Check aria-hidden="true" />
          <p>You’re all caught up.</p>
          <Button variant="outline" onClick={() => setOpen(false)}>Done</Button>
        </div>}
      </Sheet>
    </>
  );
}
