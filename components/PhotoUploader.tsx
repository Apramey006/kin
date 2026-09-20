"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ImagePlus } from "lucide-react";
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
          accept="image/*"
          className="sr-only"
          onChange={(e) => e.target.files?.[0] && pick(e.target.files[0])}
        />
      </label>

      {preview && (
        <div className="relative inline-block overflow-hidden rounded-2xl border border-ink/10 shadow-soft">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="preview" className="block max-h-64" />
          {faces.map((f, i) => (
            <div
              key={i}
              className="absolute rounded-md border-2 border-primary shadow-[0_0_0_2px_rgba(255,255,255,0.35)]"
              style={{
                left: `${(f.box.x / (imgRef.current?.naturalWidth || 1)) * 100}%`,
                top: `${(f.box.y / (imgRef.current?.naturalHeight || 1)) * 100}%`,
                width: `${(f.box.width / (imgRef.current?.naturalWidth || 1)) * 100}%`,
                height: `${(f.box.height / (imgRef.current?.naturalHeight || 1)) * 100}%`,
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
            aria-label={`Who is face ${i + 1}?`}
            className="h-11 w-full rounded-xl border border-ink/15 bg-white px-3 text-base transition-colors hover:border-ink/25 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
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

      {preview && faces.length === 0 && (
        <p className="rounded-xl bg-paper-deep px-3.5 py-2.5 text-sm text-ink/55">
          No faces detected. You can still share it.
        </p>
      )}

      {preview && (
        <>
          <Input
            placeholder="Add a caption (optional)"
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
          <Button onClick={submit} disabled={!consent || busy} size="lg" className="w-full sm:w-auto">
            {busy ? "Sharing…" : "Share this memory"}
          </Button>
        </>
      )}
      {error && (
        <p role="alert" className="text-sm font-medium text-amber-700">
          {error}
        </p>
      )}
    </div>
  );
}
