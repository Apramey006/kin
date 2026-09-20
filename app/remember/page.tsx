"use client";

import { useEffect, useState } from "react";
import { AuthBoundary, useKinAuth, authenticatedFetch, responseJSON, contributionKey, SignOutButton } from "@/lib/client-auth";
import { Recorder } from "@/components/Recorder";

export default function RememberPage() {
  return <AuthBoundary><RememberContent /></AuthBoundary>;
}

/**
 * The wearer's own capture surface, kept deliberately separate from /wearer so
 * that recall stays a single-purpose screen.
 *
 * This page looks and behaves identically whether or not the capture window is
 * open. When it has closed, the recording is still saved and still reaches the
 * family; it simply waits for review before joining the graph. The person
 * recording never sees a door close on them.
 */
function RememberContent() {
  const { role } = useKinAuth();
  const [self, setSelf] = useState<{ contributorId: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    authenticatedFetch("/api/self")
      .then(responseJSON)
      .then((data) => { if (active) setSelf({ contributorId: data.contributorId, name: data.name }); })
      .catch(() => { if (active) setError("Your stories aren't set up on this account yet."); });
    return () => { active = false; };
  }, [role]);

  const submit = async (blob: Blob, mime: string) => {
    if (!self) return;
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      const fd = new FormData();
      fd.append("file", new File([blob], `story.${mime.includes("mp4") ? "m4a" : "webm"}`, { type: mime }));
      fd.append("contributor_id", self.contributorId);
      const json = await responseJSON(await authenticatedFetch("/api/memories/story", {
        method: "POST", body: fd,
        headers: { "Idempotency-Key": await contributionKey(blob, [self.contributorId, mime]) },
      }));
      // Identical confirmation whether the story committed or is awaiting
      // review. The distinction is the family's business, not the wearer's.
      setSaved(json.transcript ?? "Saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't save. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="fixed inset-0 flex flex-col bg-stage text-white text-[22px]">
      <header className="flex items-center justify-between px-6 pb-3 pt-[max(1rem,env(safe-area-inset-top))]">
        <span className="text-lg font-semibold tracking-[0.18em] text-white/70">KIN</span>
        {self?.name && <span className="text-lg text-white/50">{self.name}</span>}
        <SignOutButton />
      </header>

      <div className="flex flex-1 flex-col justify-center gap-6 px-6 pb-6">
        <div>
          <h1 className="text-[34px] font-semibold leading-tight">Tell us something.</h1>
          <p className="mt-3 text-[22px] leading-snug text-white/65">
            Anything you remember. Your family keeps it.
          </p>
        </div>

        {saved && (
          <div className="animate-fade-up rounded-3xl bg-paper/95 px-7 py-6 text-[24px] leading-snug text-ink shadow-cue">
            <p className="mb-2 font-medium">Saved. Thank you.</p>
            <p className="text-[20px] text-ink/70">“{saved}”</p>
          </div>
        )}

        {error && (
          <p role="alert" className="text-[20px] leading-snug text-amber-200/90">{error}</p>
        )}

        <div className="[&_button]:min-h-[180px] [&_button]:w-full [&_button]:rounded-[2rem] [&_button]:text-[30px]">
          <Recorder
            onRecorded={submit}
            maxSeconds={180}
            label="Record a memory"
            disabled={busy || !self}
          />
        </div>
      </div>
    </main>
  );
}
