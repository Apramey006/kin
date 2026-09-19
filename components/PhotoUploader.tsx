"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { detectFaces, type DetectedFace } from "@/lib/faces";
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
  const imgRef = useRef<HTMLImageElement | null>(null);

  const pick = async (f: File) => {
    setFile(f);
    setError(null);
    const url = URL.createObjectURL(f);
    setPreview(url);
    try {
      const img = new window.Image();
      img.src = url;
      await img.decode();
      imgRef.current = img;
      const detected = await detectFaces(img);
      setFaces(detected);
      setLabels(
        detected.map(() => ({
          mode: personNodes.length ? "existing" : "new",
          person_node_id: personNodes[0]?.id ?? "",
          newName: "",
          newRelation: "",
        }))
      );
    } catch {
      setFaces([]);
      setLabels([]);
    }
  };

  const submit = async () => {
    if (!file || !consent) return;
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("contributor_id", contributorId);
      fd.append("caption", caption);
      fd.append(
        "labels",
        JSON.stringify(
          labels.map((l, i) => ({
            box: faces[i]?.box,
            person_node_id: l.mode === "existing" ? l.person_node_id : undefined,
            new_person:
              l.mode === "new" && l.newName
                ? { name: l.newName, relation_to_wearer: l.newRelation }
                : undefined,
          }))
        )
      );
      const res = await fetch("/api/memories/photo", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "upload failed");

      // Enroll each labeled face descriptor against its person node.
      const persons: { index: number; node_id: string }[] = json.persons ?? [];
      await Promise.all(
        persons.map((p) =>
          faces[p.index]?.descriptor
            ? fetch("/api/faces/enroll", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  person_node_id: p.node_id,
                  contributor_id: contributorId,
                  memory_id: json.memory_id,
                  descriptor: faces[p.index].descriptor,
                }),
              })
            : Promise.resolve()
        )
      );
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
      <label className="block">
        <span className="sr-only">Choose a photo</span>
        <input
          type="file"
          accept="image/*"
          className="block w-full text-base file:mr-4 file:rounded-xl file:border-0 file:bg-primary file:px-4 file:py-2 file:text-white"
          onChange={(e) => e.target.files?.[0] && pick(e.target.files[0])}
        />
      </label>

      {preview && (
        <div className="relative inline-block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="preview" className="max-h-64 rounded-xl" />
          {faces.map((f, i) => (
            <div
              key={i}
              className="absolute border-2 border-primary rounded"
              style={{
                left: `${(f.box.x / (imgRef.current?.naturalWidth || 1)) * 100}%`,
                top: `${(f.box.y / (imgRef.current?.naturalHeight || 1)) * 100}%`,
                width: `${(f.box.width / (imgRef.current?.naturalWidth || 1)) * 100}%`,
                height: `${(f.box.height / (imgRef.current?.naturalHeight || 1)) * 100}%`,
              }}
            />
          ))}
        </div>
      )}

      {faces.map((_, i) => (
        <div key={i} className="rounded-xl border border-ink/10 p-3 space-y-2">
          <div className="text-sm font-medium">Face {i + 1}: who is this?</div>
          <select
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
            <div className="flex gap-2">
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

      {preview && faces.length === 0 && (
        <p className="text-sm text-ink/60">No faces detected. You can still share it.</p>
      )}

      {preview && (
        <>
          <Input
            placeholder="Add a caption (optional)"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
          />
          <label className="flex items-start gap-3 text-base">
            <input
              type="checkbox"
              className="mt-1 h-5 w-5 accent-primary"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            I have permission to add this person&apos;s photo to our family
            memory.
          </label>
          <Button onClick={submit} disabled={!consent || busy} size="lg">
            {busy ? "Sharing…" : "Share this memory"}
          </Button>
        </>
      )}
      {error && <p className="text-sm text-amber-700">{error}</p>}
    </div>
  );
}
