"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ImagePlus } from "lucide-react";
import { authenticatedFetch, responseJSON, contributionKey } from "@/lib/client-auth";
type DetectedFace = { temporaryFaceId: string; box: { x: number; y: number; width: number; height: number } };
import type { GraphNodeRow } from "@/lib/types";

interface FaceLabelState {
  mode: "existing" | "new";
  person_node_id: string;
  newName: string;
  newRelation: string;
}

export function PhotoUploader({
  contributorId,
  personNodes,
  onDone,
}: {
  contributorId: string;
  personNodes: GraphNodeRow[];
  onDone: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [faces, setFaces] = useState<DetectedFace[]>([]);
  const [labels, setLabels] = useState<FaceLabelState[]>([]);
  const [caption, setCaption] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [detectionFailed, setDetectionFailed] = useState(false);
  const selection = useRef(0);
  const completed = useRef(false);
  const [dimensions, setDimensions] = useState({ width: 1, height: 1 });
  useEffect(() => () => { selection.current++; }, []);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const pick = async (f: File, preserveLabels = false) => {
    const request = ++selection.current;
    if (!preserveLabels) { setFile(f); setConsent(false); setLabels([]); setFaces([]); setPreview(URL.createObjectURL(f)); completed.current = false; }
    setError(null); setDetecting(true); setDetectionFailed(false);
    try {
      const fd = new FormData(); fd.append("file", f);
      const detected = await responseJSON(await authenticatedFetch("/api/faces/detect", { method: "POST", body: fd }));
      if (request !== selection.current) return;
      setFaces(detected.faces);
      setLabels((previous) => detected.faces.map((_: DetectedFace, index: number) => preserveLabels && previous[index] ? previous[index] : ({ mode: "existing", person_node_id: "", newName: "", newRelation: "" })));
    } catch (failure) {
      if (request !== selection.current) return;
      setDetectionFailed(true);
      setError(failure instanceof Error ? failure.message : "Face detection failed. Please retry.");
    } finally { if (request === selection.current) setDetecting(false); }
  };

  const submit = async () => {
    if (!file || !consent || busy || detecting || detectionFailed) return;
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("contributor_id", contributorId);
      fd.append("caption", caption);
      fd.append("consent", "true");
      const selected = labels.map((label, index) => ({ label, index })).filter(({ label }) => label.mode === "new" ? Boolean(label.newName.trim()) : Boolean(label.person_node_id));
      fd.append(
        "labels",
        JSON.stringify(
          selected.map(({ label: l, index: i }) => ({
            box: faces[i]?.box,
            person_node_id: l.mode === "existing" ? l.person_node_id : undefined,
            new_person:
              l.mode === "new" && l.newName
                ? { name: l.newName, relation_to_wearer: l.newRelation }
                : undefined,
          }))
        )
      );
      const json = await responseJSON(await authenticatedFetch("/api/memories/photo", { method: "POST", body: fd, headers: { "Idempotency-Key": await contributionKey(file, [contributorId, caption, fd.get("labels"), true]) } }));

      // Selection tokens remain bound to the exact original File sent above.
      const persons: { index: number; node_id: string }[] = json.persons ?? [];
      for (const person of persons) {
        const face = faces[selected[person.index]?.index];
        if (!face) throw new Error("Photo saved, but the selected face was not available for enrollment. Please retry.");
        try {
          await responseJSON(await authenticatedFetch("/api/faces/enroll", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ person_node_id: person.node_id, contributor_id: contributorId, memory_id: json.memory_id, temporaryFaceId: face.temporaryFaceId, consent: true }),
          }));
        } catch (failure) {
          throw new Error("Photo saved, but face enrollment did not finish. " + (failure instanceof Error ? failure.message : "Please retry."));
        }
      }
      completed.current = true;
      setFile(null);
      setPreview(null);
      setFaces([]);
      setLabels([]);
      setCaption("");
      setConsent(false);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "upload failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-ink/15 bg-paper-deep px-6 py-8 text-center transition-colors hover:border-primary/40 hover:bg-primary-soft">
        <ImagePlus className="h-7 w-7 text-primary" aria-hidden />
        <span className="font-medium text-ink/80">
          {file ? "Choose a different photo" : "Choose a photo"}
        </span>
        <span className="text-sm text-ink/45">
          {file ? file.name : "Kin will look for faces to label"}
        </span>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={busy || detecting}
          className="sr-only"
          onChange={(e) => e.target.files?.[0] && pick(e.target.files[0])}
        />
      </label>

      {preview && (
        <div className="relative inline-block overflow-hidden rounded-2xl border border-ink/10 shadow-soft">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img ref={imgRef} src={preview} alt="Selected family photo" className="max-h-64 rounded-xl" onLoad={(event) => setDimensions({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })} />
          {faces.map((f, i) => (
            <div
              key={i}
              className="absolute rounded-md border-2 border-primary shadow-[0_0_0_2px_rgba(255,255,255,0.35)]"
              style={{
                left: `${(f.box.x / dimensions.width) * 100}%`,
                top: `${(f.box.y / dimensions.height) * 100}%`,
                width: `${(f.box.width / dimensions.width) * 100}%`,
                height: `${(f.box.height / dimensions.height) * 100}%`,
              }}
            >
              <span className="absolute -top-2 left-0 rounded bg-primary px-1.5 text-[10px] font-semibold leading-4 text-white">
                {i + 1}
              </span>
            </div>
          ))}
        </div>
      )}

      {faces.map((_, i) => (
        <div
          key={i}
          className="space-y-2 rounded-xl border border-ink/[0.08] bg-paper-deep p-3.5"
        >
          <div className="flex items-center gap-2 text-sm font-medium text-ink/75">
            <span className="flex h-5 w-5 items-center justify-center rounded bg-primary text-[10px] font-semibold text-white">
              {i + 1}
            </span>
            Who is this?
          </div>
          <select
            disabled={busy || detecting}
            aria-label={`Person for face ${i + 1}`}
            className="h-11 w-full rounded-xl border border-ink/15 bg-white px-3"
            value={labels[i].mode === "existing" ? labels[i].person_node_id : "__new__"}
            onChange={(e) => {
              const v = e.target.value;
              setLabels((ls) =>
                ls.map((l, j) =>
                  j === i
                    ? v === "__new__"
                      ? { ...l, mode: "new" }
                      : { ...l, mode: "existing", person_node_id: v }
                    : l
                )
              );
            }}
          >
            <option value="">Do not enroll this face</option>
            {personNodes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
                {p.relation_to_wearer && p.relation_to_wearer !== "self"
                  ? ` (${p.relation_to_wearer})`
                  : ""}
              </option>
            ))}
            <option value="__new__">Someone new…</option>
          </select>
          {labels[i].mode === "new" && (
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                placeholder="Name"
                value={labels[i].newName}
                onChange={(e) =>
                  setLabels((ls) =>
                    ls.map((l, j) => (j === i ? { ...l, newName: e.target.value } : l))
                  )
                }
              />
              <Input
                placeholder="Relation (e.g. sister)"
                value={labels[i].newRelation}
                onChange={(e) =>
                  setLabels((ls) =>
                    ls.map((l, j) =>
                      j === i ? { ...l, newRelation: e.target.value } : l
                    )
                  )
                }
              />
            </div>
          )}
        </div>
      ))}

      {preview && !detecting && !detectionFailed && faces.length === 0 && (
        <p className="text-sm text-ink/60">No faces detected. You can still share it.</p>
      )}

      {preview && (
        <>
          <Input
            disabled={busy}
            placeholder="Tell the story in your own words (optional)"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
          />
          <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-paper-deep p-3.5 text-[15px] leading-snug text-ink/80">
            <input
              type="checkbox"
              className="mt-0.5 h-5 w-5 shrink-0 accent-primary"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            I have permission to add this person&apos;s photo to our family
            memory.
          </label>
          <Button onClick={submit} disabled={!consent || busy || detecting || detectionFailed} size="lg">
            {busy ? "Sharing…" : "Share this memory"}
          </Button>
        </>
      )}
      {detecting && <p role="status">Finding faces…</p>}
      {file && !busy && !detecting && <Button variant="outline" onClick={() => pick(file, true)}>Refresh face selections</Button>}
      {completed.current && !file && <p role="status">Memory shared. Selected faces enrolled.</p>}
      {error && <p role="alert" className="text-sm text-amber-700">{error}</p>}
    </div>
  );
}
