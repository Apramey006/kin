import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { getServiceClient, FAMILY_ID } from "@/lib/supabase";
import { captionImage, embedText, chatJSON } from "@/lib/providers/openai";
import { synthesizeSpeech } from "@/lib/providers/elevenlabs";
import { runKeepers } from "@/lib/keepers";
import { evaluateGate, type GateInfo } from "@/lib/gate";
import { SILENCE_REASONS } from "@/lib/config";
import { synthesizeCue, pickContextPath } from "@/lib/synthesize";
import {
  resolveDescriptors,
  BROWSER_FACE_MODEL,
  type DescriptorResult,
} from "@/lib/faces-server";
import { zeroVector } from "@/lib/util";
import { z } from "zod";
import type {
  GraphEdgeRow,
  GraphNodeRow,
  Keeper,
  RecallEventRow,
} from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const cueZod = z.object({ sentence: z.string() });

async function rewriteCue(summaries: string[], wearerName: string): Promise<string> {
  const res = await chatJSON<{ sentence: string }>({
    name: "cue_rewrite",
    jsonSchema: {
      type: "object",
      additionalProperties: false,
      required: ["sentence"],
      properties: { sentence: { type: "string" } },
    },
    zodSchema: cueZod,
    system: `Write one warm sentence, at most 18 words, addressed to ${wearerName} in second person, using only facts in the provided notes. No new names, places, or dates.`,
    user: `Notes:\n${summaries.map((s) => `- ${s}`).join("\n")}`,
  });
  return res.sentence;
}

const isDescriptor = (d: unknown): d is number[] =>
  Array.isArray(d) &&
  d.length === 128 &&
  d.every((n) => typeof n === "number" && Number.isFinite(n));

export async function POST(req: Request) {
  const t0 = Date.now();
  let eventId: string | null = null;
  try {
    const sb = getServiceClient();
    // Promise.resolve forces the lazy query builder to start now.
    const relativesP = Promise.resolve(
      sb.from("relatives").select("*").eq("family_id", FAMILY_ID)
    );

    let snapshot: Buffer | null = null;
    let snapshotPath: string | null = null;
    // Descriptor resolution may call the face service, so it is deferred until
    // after the running event is inserted.
    let resolveP: () => Promise<DescriptorResult> = async () => ({
      descriptors: [],
      model: BROWSER_FACE_MODEL,
      source: "none",
    });

    const contentType = req.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      // Replay: reuse the last event's snapshot and descriptors.
      const { replayEventId } = (await req.json()) as { replayEventId: string };
      const { data: prev } = await sb
        .from("recall_events")
        .select("*")
        .eq("id", replayEventId)
        .eq("family_id", FAMILY_ID)
        .single();
      if (!prev) return NextResponse.json({ error: "event not found" }, { status: 404 });
      snapshotPath = prev.snapshot_path;
      // Legacy rows store a bare descriptor array; newer rows store
      // { model, source, descriptors }.
      const stored: DescriptorResult = Array.isArray(prev.face_descriptors)
        ? {
            descriptors: prev.face_descriptors as number[][],
            model: BROWSER_FACE_MODEL,
            source: "browser",
          }
        : {
            descriptors: prev.face_descriptors?.descriptors ?? [],
            model: prev.face_descriptors?.model ?? BROWSER_FACE_MODEL,
            source: prev.face_descriptors?.source ?? "browser",
          };
      if (snapshotPath) {
        const { data: blob } = await sb.storage.from("media").download(snapshotPath);
        if (blob) snapshot = Buffer.from(await blob.arrayBuffer());
      }
      // Re-run detection when a snapshot exists so a replay after the face
      // service comes online uses server descriptors.
      const snap = snapshot;
      resolveP = () =>
        snap
          ? resolveDescriptors(snap, "image/jpeg", stored.descriptors)
          : Promise.resolve(stored);
    } else {
      const form = await req.formData();
      const file = form.get("snapshot") as File | null;
      const parsed: unknown = JSON.parse(
        (form.get("faceDescriptors") as string) ?? "[]"
      );
      if (!Array.isArray(parsed) || !parsed.every(isDescriptor)) {
        return NextResponse.json(
          { error: "faceDescriptors must be arrays of 128 numbers" },
          { status: 400 }
        );
      }
      if (file) snapshot = Buffer.from(await file.arrayBuffer());
      const snap = snapshot;
      const mime = file?.type || "image/jpeg";
      resolveP = () => resolveDescriptors(snap, mime, parsed);
    }

    // 1. Insert the running event immediately so Stage animates.
    const { data: event, error: evErr } = await sb
      .from("recall_events")
      .insert({ family_id: FAMILY_ID, status: "running" })
      .select()
      .single();
    if (evErr) throw evErr;
    eventId = event.id;

    const descriptorResult = await resolveP();
    const descriptors = descriptorResult.descriptors;

    // 2. Vision/embed starts on the snapshot right away; the storage upload
    //    and the event row update run concurrently with it.
    const captionP = (snapshot ? captionImage(snapshot) : Promise.resolve(null)).catch(
      () => null
    );
    const embeddingP: Promise<number[]> = captionP
      .then((c) =>
        c ? embedText(`${c.caption} ${c.objects.join(" ")} ${c.setting}`) : zeroVector(1536)
      )
      .catch(() => zeroVector(1536));

    const eventUpdateP = (async () => {
      if (snapshot && !snapshotPath) {
        snapshotPath = `${FAMILY_ID}/recall-${eventId}.jpg`;
        await sb.storage
          .from("media")
          .upload(snapshotPath, snapshot, { contentType: "image/jpeg" });
      }
      await sb
        .from("recall_events")
        .update({
          snapshot_path: snapshotPath,
          face_descriptors: {
            model: descriptorResult.model,
            source: descriptorResult.source,
            descriptors,
          },
        })
        .eq("id", eventId);
    })();

    // 3. All keepers concurrently.
    const [{ data: relatives }] = await Promise.all([relativesP, eventUpdateP]);
    const keepers: Keeper[] = (relatives ?? []).map((r) => ({
      relativeId: r.id,
      name: r.name,
      color: r.color,
    }));
    const keeperResults = await runKeepers(sb, FAMILY_ID, keepers, {
      faceDescriptors: descriptors,
      embeddingPromise: embeddingP,
    });
    await sb
      .from("recall_events")
      .update({ keeper_results: keeperResults })
      .eq("id", eventId);

    // 4. Gate.
    const citedIds = [...new Set(keeperResults.flatMap((r) => r.memoryIds))];
    const subjectIds = [
      ...new Set(
        keeperResults.map((r) => r.claim?.subjectNodeId).filter(Boolean) as string[]
      ),
    ];
    const [citedMems, subjectProv] = await Promise.all([
      citedIds.length
        ? sb.from("memories").select("id, kind, contributor_id").in("id", citedIds)
        : Promise.resolve({ data: [] }),
      subjectIds.length
        ? sb.from("provenance").select("node_id").in("node_id", subjectIds).limit(100)
        : Promise.resolve({ data: [] }),
    ]);
    const info: GateInfo = {
      memoryKinds: {},
      memoryOwners: {},
      subjectProvenance: {},
    };
    for (const m of citedMems.data ?? []) {
      info.memoryKinds[m.id] = m.kind;
      info.memoryOwners[m.id] = m.contributor_id;
    }
    for (const p of subjectProv.data ?? []) {
      if (p.node_id) info.subjectProvenance[p.node_id] = true;
    }

    const gate = evaluateGate(keeperResults, info);
    await sb.from("recall_events").update({ gate }).eq("id", eventId);

    const latency = () => Date.now() - t0;

    if (gate.decision === "silent") {
      await sb
        .from("recall_events")
        .update({ status: "silent", silence_reason: gate.reason, latency_ms: latency() })
        .eq("id", eventId);
      return NextResponse.json({
        decision: "silent",
        reason: gate.reason,
        eventId,
        descriptorSource: descriptorResult.source,
        faceModel: descriptorResult.model,
      });
    }

    // 5. SPEAK: one batch fetch, then synthesize a grounded cue, then TTS.
    const [{ data: allNodes }, { data: allEdges }, { data: wearer }] =
      await Promise.all([
        sb.from("graph_nodes").select("*").eq("family_id", FAMILY_ID),
        sb.from("graph_edges").select("*").eq("family_id", FAMILY_ID),
        sb.from("wearer").select("name").eq("family_id", FAMILY_ID).single(),
      ]);
    const nodes = (allNodes ?? []) as GraphNodeRow[];
    const edges = (allEdges ?? []) as GraphEdgeRow[];
    const wearerName = wearer?.name ?? "you";
    const subject = nodes.find((n) => n.id === gate.subjectNodeId) ?? null;
    if (!subject) {
      await sb
        .from("recall_events")
        .update({
          status: "silent",
          silence_reason: SILENCE_REASONS.noProvenance,
          latency_ms: latency(),
        })
        .eq("id", eventId);
      return NextResponse.json({
        decision: "silent",
        reason: SILENCE_REASONS.noProvenance,
        eventId,
        descriptorSource: descriptorResult.source,
        faceModel: descriptorResult.model,
      });
    }

    const path = pickContextPath(subject.id, nodes, edges);
    let contextSummaries: string[] = [];
    if (path) {
      const { data: provRows } = await sb
        .from("provenance")
        .select("memory_id")
        .in("edge_id", path.edges.map((e) => e.id));
      const memIds = [...new Set((provRows ?? []).map((p) => p.memory_id))];
      if (memIds.length) {
        const { data: mems } = await sb
          .from("memories")
          .select("summary")
          .in("id", memIds);
        contextSummaries = (mems ?? []).map((m) => m.summary);
      }
    }

    const cue = await synthesizeCue({
      subject,
      nodes,
      edges,
      contextSummaries,
      wearerName,
      rewrite: rewriteCue,
    });

    const ttsP = (async (): Promise<string | null> => {
      try {
        const mp3 = await synthesizeSpeech(cue.text);
        return mp3.toString("base64");
      } catch {
        return null; // client falls back to speechSynthesis
      }
    })();
    const [audio] = await Promise.all([
      ttsP,
      sb
        .from("recall_events")
        .update({ status: "speak", cue_text: cue.text, latency_ms: latency() })
        .eq("id", eventId),
    ]);

    return NextResponse.json({
      decision: "speak",
      cueText: cue.text,
      audio,
      eventId,
      latencyMs: latency(),
      descriptorSource: descriptorResult.source,
      faceModel: descriptorResult.model,
    });
  } catch (e) {
    if (eventId) {
      const short = e instanceof Error ? e.message.slice(0, 120) : "unknown";
      try {
        await getServiceClient()
          .from("recall_events")
          .update({
            status: "silent",
            silence_reason: `error: ${short}`,
            latency_ms: Date.now() - t0,
          })
          .eq("id", eventId);
      } catch {
        // best-effort terminal state
      }
    }
    return jsonError(e, "recall failed");
  }
}

export async function GET() {
  // Latest event id, used by Stage's "Replay last recall".
  try {
    const sb = getServiceClient();
    const { data } = await sb
      .from("recall_events")
      .select("id")
      .eq("family_id", FAMILY_ID)
      .order("created_at", { ascending: false })
      .limit(1);
    const event = (data?.[0] ?? null) as Pick<RecallEventRow, "id"> | null;
    return NextResponse.json({ lastEventId: event?.id ?? null });
  } catch (e) {
    return jsonError(e, "failed");
  }
}
