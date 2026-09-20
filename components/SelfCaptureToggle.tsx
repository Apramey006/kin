"use client";

import { useEffect, useState } from "react";
import { authenticatedFetch, responseJSON } from "@/lib/client-auth";
import { Button } from "@/components/ui/button";

/**
 * Whether the wearer's own stories join the family memory directly, or wait
 * for a contributor to read them first.
 *
 * Framed as reviewing, never as restricting: turning review on takes nothing
 * away from the wearer, so a family can do it early without it being a
 * statement about anyone's decline.
 */
export function SelfCaptureToggle() {
  const [state, setState] = useState<{ name: string | null; captureOpen: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    authenticatedFetch("/api/self/window")
      .then(responseJSON)
      .then((data) => {
        if (active && data.hasSelfKeeper) setState({ name: data.name, captureOpen: data.captureOpen });
      })
      .catch(() => { /* no self keeper, or a wearer session: nothing to show */ });
    return () => { active = false; };
  }, []);

  if (!state) return null;
  const who = state.name ?? "their";
  const reviewing = !state.captureOpen;

  const toggle = async () => {
    setBusy(true);
    setError(null);
    try {
      const data = await responseJSON(await authenticatedFetch("/api/self/window", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ captureOpen: reviewing }),
      }));
      setState((prev) => (prev ? { ...prev, captureOpen: data.captureOpen } : prev));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not change that setting.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-2xl border border-ink/10 bg-paper-deep p-5">
      <h2 className="font-semibold">{who}&rsquo;s own stories</h2>
      <p className="mt-1 text-sm leading-snug text-ink/70">
        {reviewing
          ? `You read ${who}'s new stories before they join your family memory. ${who} records exactly as before.`
          : `${who}'s stories join your family memory as soon as they record them.`}
      </p>
      {error && <p role="alert" className="mt-2 text-sm text-amber-700">{error}</p>}
      <Button variant="outline" className="mt-3" onClick={toggle} disabled={busy}>
        {reviewing ? "Add them automatically" : "Review them first"}
      </Button>
    </section>
  );
}
