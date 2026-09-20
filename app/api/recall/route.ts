import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { getServiceClient, FAMILY_ID } from "@/lib/supabase";
import { captionImage, embedText, chatJSON } from "@/lib/providers/ai";
import { synthesizeSpeech } from "@/lib/providers/elevenlabs";
import { runKeepers } from "@/lib/keepers";
import { evaluateGate, type GateInfo } from "@/lib/gate";
import { synthesizeCue, pickContextPath } from "@/lib/synthesize";
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

export async function POST(req: Request) {
  const t0 = Date.now();
  try {
    const sb = getServiceClient();

    let snapshot: Buffer | null = null;
    let snapshotPath: string | null = null;
    let descriptors: number[][] = [];

    const contentType = req.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      // Replay: reuse the last event's snapshot and descriptors.
      const { replayEventId } = (await req.json()) as { replayEventId: string };
      const { data: prev } = await sb
        .from("recall_events")
        .select("*")
        .eq("id", replayEventId)
        .single();
      if (!prev) return NextResponse.json({ error: "event not found" }, { status: 404 });
      snapshotPath = prev.snapshot_path;
      descriptors = (prev.face_descriptors ?? []) as number[][];
      if (snapshotPath) {
        const { data: blob } = await sb.storage.from("media").download(snapshotPath);
        if (blob) snapshot = Buffer.from(await blob.arrayBuffer());
      }
    } else {
      const form = await req.formData();
      const file = form.get("snapshot") as File | null;
      descriptors = JSON.parse((form.get("faceDescriptors") as string) ?? "[]");
      if (file) snapshot = Buffer.from(await file.arrayBuffer());
    }

    // 1. Insert the running event immediately so Stage animates.
    const { data: event, error: evErr } = await sb
      .from("recall_events")
      .insert({ family_id: FAMILY_ID, status: "running" })
      .select()
      .single();
    if (evErr) throw evErr;
    const eventId = event.id;

    // 2. Upload snapshot + kick off vision/embed. Face matching inside the
    //    keepers starts on descriptors without waiting for the caption.
    if (snapshot && !snapshotPath) {
      snapshotPath = `${FAMILY_ID}/recall-${eventId}.jpg`;
      await sb.storage
        .from("media")
        .upload(snapshotPath, snapshot, { contentType: "image/jpeg" });
    }
    await sb
      .from("recall_events")
      .update({ snapshot_path: snapshotPath, face_descriptors: descriptors })
      .eq("id", eventId);

    const captionP = (snapshot ? captionImage(snapshot) : Promise.resolve(null)).catch(
      () => null
    );
    const embeddingP: Promise<number[]> = captionP
      .then((c) =>
        c ? embedText(`${c.caption} ${c.objects.join(" ")} ${c.setting}`) : zeroVector(1536)
      )
      .catch(() => zeroVector(1536));

    // 3. All keepers concurrently.
    const { data: relatives } = await sb
      .from("relatives")
      .select("*")
      .eq("family_id", FAMILY_ID);
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
      });
    }

    // 5. SPEAK: synthesize a grounded cue, then TTS.
    const { data: subject } = await sb
      .from("graph_nodes")
      .select("*")
      .eq("id", gate.subjectNodeId)
      .single();
    const [{ data: allNodes }, { data: allEdges }, { data: wearer }] =
      await Promise.all([
        sb.from("graph_nodes").select("*").eq("family_id", FAMILY_ID),
        sb.from("graph_edges").select("*").eq("family_id", FAMILY_ID),
        sb.from("wearer").select("name").eq("family_id", FAMILY_ID).single(),
      ]);
    const nodes = (allNodes ?? []) as GraphNodeRow[];
    const edges = (allEdges ?? []) as GraphEdgeRow[];
    const wearerName = wearer?.name ?? "you";

    const path = subject
      ? pickContextPath(subject.id, nodes, edges)
      : null;
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
      subject: subject as GraphNodeRow,
      nodes,
      edges,
      contextSummaries,
      wearerName,
      rewrite: rewriteCue,
    });

    let audio: string | null = null;
    try {
      const mp3 = await synthesizeSpeech(cue.text);
      audio = mp3.toString("base64");
    } catch {
      audio = null; // client falls back to speechSynthesis
    }

    await sb
      .from("recall_events")
      .update({ status: "speak", cue_text: cue.text, latency_ms: latency() })
      .eq("id", eventId);

    return NextResponse.json({
      decision: "speak",
      cueText: cue.text,
      audio,
      eventId,
      latencyMs: latency(),
    });
  } catch (e) {
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
