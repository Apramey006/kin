"use client";
import { useEffect, useRef, useState } from "react";
import { ImagePlus, Check } from "lucide-react";
import { Button } from "./ui/button";
import { authenticatedFetch, responseJSON, contributionKey } from "@/lib/client-auth";
type DetectedFace = { temporaryFaceId: string; box: { x:number; y:number; width:number; height:number } };
import type { GraphNodeRow } from "@/lib/types";
interface FaceLabel {
  personId: string;
  name: string;
  relation: string;
}
export function PhotoUploader({
  contributorId,
  personNodes,
  onDone,
  onBusy,
}: {
  contributorId: string;
  personNodes: GraphNodeRow[];
  onDone: () => void;
  onBusy?: (busy: boolean) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [faces, setFaces] = useState<DetectedFace[]>([]);
  const [labels, setLabels] = useState<FaceLabel[]>([]);
  const [caption, setCaption] = useState("");
  const [consent, setConsent] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [detectionFailed, setDetectionFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dimensions = useRef({ width: 1, height: 1 });
  const generation = useRef(0);
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  const pick = async (f: File) => {
    if (f.size > 15 * 1024 * 1024) {
      setError("Choose a photo smaller than 15 MB.");
      return;
    }
    const attempt = ++generation.current;
    setFile(f);
    setFaces([]);
    setLabels([]);
    setConsent(false);
    setDetecting(true);
    setDetectionFailed(false);
    setError(null);
    const url = URL.createObjectURL(f);
    setPreview(url);
    try {
      const img = new window.Image();
      img.src = url;
      await img.decode();
      dimensions.current = {
        width: img.naturalWidth,
        height: img.naturalHeight,
      };
      const request = new FormData(); request.append("file", f);
      const detected = await responseJSON(await authenticatedFetch("/api/faces/detect", { method:"POST", body:request }));
      const result: DetectedFace[] = detected.faces;
      if (attempt !== generation.current) return;
      setFaces(result);
      setLabels(result.map(() => ({ personId: "", name: "", relation: "" })));
    } catch (failure) {
      if (attempt === generation.current) {
        setDetectionFailed(true);
        setError(
          failure instanceof Error ? failure.message : "This photo couldn’t be read. Try a clear JPG, PNG, or WebP photo.",
        );
      }
    } finally {
      if (attempt === generation.current) setDetecting(false);
    }
  };
  const update = (i: number, values: Partial<FaceLabel>) =>
    setLabels((current) =>
      current.map((l, j) => (j === i ? { ...l, ...values } : l)),
    );
  const submit = async () => {
    if (!file || !consent) return;
    setBusy(true);
    onBusy?.(true);
    setError(null);
    try {
      const enrolled = labels.map((label, index) => ({ label, face: faces[index] }))
        .filter(({ label }) => label.personId !== "skip");
      const fd = new FormData();
      fd.append("file", file);
      fd.append("contributor_id", contributorId);
      fd.append("caption", caption);
      fd.append("consent", "true");
      fd.append(
        "labels",
        JSON.stringify(
          enrolled.map(({ label: l, face }) => ({
            box: face.box,
            person_node_id: l.personId !== "new" ? l.personId : undefined,
            new_person:
              l.personId === "new"
                ? { name: l.name.trim(), relation_to_wearer: l.relation.trim() }
                : undefined,
          })),
        ),
      );
      const res = await authenticatedFetch("/api/memories/photo", {
        method: "POST",
        body: fd,
        headers: { "Idempotency-Key": await contributionKey(file, [contributorId, caption, fd.get("labels"), true]) },
      });
      const j = await res.json();
      if (!res.ok)
        throw new Error(
          j.error ?? "Your photo couldn’t be saved. Please try again.",
        );
      for (const person of j.persons ?? []) {
        const face = enrolled[person.index]?.face;
        if (!face) throw new Error("Photo saved, but its face label could not be found. Please retry.");
        try {
          await responseJSON(await authenticatedFetch("/api/faces/enroll", {
            method:"POST", headers:{"Content-Type":"application/json"},
            body:JSON.stringify({person_node_id:person.node_id, contributor_id:contributorId,
              memory_id:j.memory_id, temporaryFaceId:face.temporaryFaceId, consent:true}),
          }));
        } catch (failure) {
          throw new Error("Photo saved, but face recognition setup did not finish. " + (failure instanceof Error ? failure.message : "Please retry."));
        }
      }
      onDone();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Your photo couldn’t be saved.",
      );
    } finally {
      setBusy(false);
      onBusy?.(false);
    }
  };
  const valid = labels.every(
    (l) =>
      l.personId &&
      (l.personId !== "new" || (l.name.trim() && l.relation.trim())),
  );
  return (
    <div className="stack">
      <label className="upload-area">
        <ImagePlus aria-hidden="true" />
        <span>
          {file ? "Choose a different photo" : "Choose a familiar photo"}
        </span>
        <small>
          One clear face works best. JPG, PNG, or WebP · up to 15 MB
        </small>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          aria-label="Choose a photo"
          disabled={busy || detecting}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) pick(f);
            e.target.value = "";
          }}
        />
      </label>
      {preview && (
        <div className="photo-preview">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview}
            alt="Your selected photo, with any detected faces numbered"
          />
          {faces.map((f, i) => (
            <div
              key={i}
              className="face-box"
              style={{
                left: `${(f.box.x / dimensions.current.width) * 100}%`,
                top: `${(f.box.y / dimensions.current.height) * 100}%`,
                width: `${(f.box.width / dimensions.current.width) * 100}%`,
                height: `${(f.box.height / dimensions.current.height) * 100}%`,
              }}
            >
              <span>{i + 1}</span>
            </div>
          ))}
        </div>
      )}
      {detecting && (
        <p className="notice row" role="status">
          <span className="spinner" aria-hidden="true" />
          Finding the faces in your photo…
        </p>
      )}
      {preview && !detecting && !detectionFailed && faces.length === 0 && (
        <p className="notice">
          No faces found. You can save this as a memory, but Kin won’t use it to
          recognize someone.
        </p>
      )}
      {file && detectionFailed && <Button variant="outline" onClick={() => pick(file)} disabled={busy}>Try face detection again</Button>}
      {faces.map((_, i) => (
        <fieldset key={i} className="face-label">
          <legend>Person {i + 1}</legend>
          <div className="field">
            <label htmlFor={`face-${i}`}>Who is this?</label>
            <select
              id={`face-${i}`}
              value={labels[i]?.personId ?? ""}
              onChange={(e) => update(i, { personId: e.target.value })}
            >
              <option value="" disabled>
                Choose a person
              </option>
              {personNodes.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                  {p.relation_to_wearer && p.relation_to_wearer !== "self"
                    ? ` · ${p.relation_to_wearer}`
                    : ""}
                </option>
              ))}
              <option value="new">Add someone new</option>
              <option value="skip">Do not recognize this person</option>
            </select>
          </div>
          {labels[i]?.personId === "new" && (
            <div className="form-grid">
              <div className="field">
                <label htmlFor={`name-${i}`}>Their name</label>
                <input
                  id={`name-${i}`}
                  maxLength={80}
                  value={labels[i].name}
                  onChange={(e) => update(i, { name: e.target.value })}
                  placeholder="e.g. Nora"
                />
              </div>
              <div className="field">
                <label htmlFor={`relation-${i}`}>
                  Relationship to your loved one
                </label>
                <input
                  id={`relation-${i}`}
                  maxLength={60}
                  value={labels[i].relation}
                  onChange={(e) => update(i, { relation: e.target.value })}
                  placeholder="e.g. sister"
                />
              </div>
            </div>
          )}
        </fieldset>
      ))}
      {preview && (
        <>
          <div className="field">
            <label htmlFor="photo-caption">
              Caption <span className="muted small">(optional)</span>
            </label>
            <textarea
              id="photo-caption"
              rows={3}
              maxLength={1000}
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Who, where, or what makes this moment special?"
            />
          </div>
          <label className="consent-label">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            <span>
              I have permission to share this photo and use the labeled faces
              for our family’s recognition.
            </span>
          </label>
          <Button
            size="lg"
            className="full"
            onClick={submit}
            disabled={
              !consent || busy || detecting || detectionFailed || !valid
            }
          >
            {busy ? (
              <>
                <span className="spinner" aria-hidden="true" />
                Saving your photo…
              </>
            ) : (
              <>
                Save photo
                <Check aria-hidden="true" />
              </>
            )}
          </Button>
        </>
      )}
      {error && (
        <p className="notice notice-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
