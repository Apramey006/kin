"use client";

import { useEffect, useState } from "react";
import { authenticatedFetch, responseJSON } from "@/lib/client-auth";

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
  const who = state.name ?? "your loved one";
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
    <section className="panel settings-section" aria-labelledby="recording-settings-heading">
      <h2 id="recording-settings-heading">{state.name ? `${state.name}’s recordings` : "Family recordings"}</h2>
      <div className="setting-row">
        <label htmlFor="review-recordings">
          Review before adding
          <small id="review-recordings-description">
            {reviewing
              ? `Read ${who}’s new stories before adding them to the shared library. Recordings are always saved.`
              : `New recordings join the shared library automatically.`}
          </small>
        </label>
        <input id="review-recordings" className="toggle" type="checkbox" role="switch"
          aria-describedby="review-recordings-description" checked={reviewing} disabled={busy} onChange={toggle} />
      </div>
      {error && <p role="alert" className="notice notice-error">{error}</p>}
      {busy && <p className="small muted" role="status">Saving preference…</p>}
    </section>
  );
}
