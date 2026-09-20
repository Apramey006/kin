import { getServiceClient, FAMILY_ID } from "@/lib/supabase";
import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError } from "@/lib/api";
import { CONFIG } from "@/lib/config";
import { synthesizeSpeech } from "@/lib/providers/elevenlabs";
import { runKeepers } from "@/lib/keepers";
import { evaluateGate, type GateInfo } from "@/lib/gate";
import { synthesizeCue, pickContextPath, type CueMemory } from "@/lib/synthesize";
import type { GraphEdgeRow, GraphNodeRow, KeeperResult } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;
const descriptorsSchema = z.array(z.array(z.number().finite()).length(128)).max(8);

export async function POST(req: Request) {
  const started = Date.now();
  let eventId: string | null = null;
  try {
    const sb = getServiceClient();
    const familyId = FAMILY_ID;
    let snapshot: Buffer | null = null;
    let snapshotPath: string | null = null;
    let descriptors: number[][];
    if (req.headers.get("content-type")?.includes("application/json")) {
      const parsed = z.object({ replayEventId: z.string().uuid() }).safeParse(await req.json());
      if (!parsed.success) return NextResponse.json({ error: "A valid replayEventId is required" }, { status: 400 });
      const prev = await sb.from("recall_events").select("snapshot_path, face_descriptors")
        .eq("family_id", familyId).eq("id", parsed.data.replayEventId).single();
      if (prev.error || !prev.data) return NextResponse.json({ error: "Recall not found" }, { status: 404 });
      snapshotPath = prev.data.snapshot_path;
      descriptors = descriptorsSchema.parse(prev.data.face_descriptors ?? []);
    } else {
      const form = await req.formData();
      const parsed = descriptorsSchema.safeParse(JSON.parse(String(form.get("faceDescriptors") ?? "[]")));
      if (!parsed.success) return NextResponse.json({ error: "Invalid face descriptors" }, { status: 400 });
      descriptors = parsed.data;
      const file = form.get("snapshot");
      if (file instanceof File) {
        if (file.size > CONFIG.maxUploadBytes) return NextResponse.json({ error: "Snapshot too large" }, { status: 413 });
        snapshot = Buffer.from(await file.arrayBuffer());
      }
    }

    const inserted = await sb.from("recall_events").insert({
      family_id: familyId, status: "running", face_descriptors: descriptors, snapshot_path: snapshotPath,
    }).select("id").single();
    if (inserted.error) throw inserted.error;
    eventId = inserted.data.id;
    const update = async (values: Record<string, unknown>) => {
      const { error } = await sb.from("recall_events").update(values).eq("id", eventId!);
      if (error) throw error;
    };
    if (snapshot && !snapshotPath) {
      snapshotPath = `${familyId}/recall-${eventId}.jpg`;
      const upload = await sb.storage.from("media").upload(snapshotPath, snapshot, { contentType: "image/jpeg" });
      if (upload.error) throw upload.error;
      await update({ snapshot_path: snapshotPath });
    }

    const relatives = await sb.from("relatives").select("*").eq("family_id", familyId);
    if (relatives.error) throw relatives.error;
    const keepers = (relatives.data ?? []).map((r) => ({ relativeId: r.id, name: r.name, color: r.color }));
    const progress: KeeperResult[] = [];
    let writes = Promise.resolve();
    const results = await runKeepers(sb, familyId, keepers, { faceDescriptors: descriptors }, async (result) => {
      progress.push(result);
      const snapshot = [...progress];
      writes = writes.then(() => update({ keeper_results: snapshot }));
      await writes;
    });
    const citedIds = [...new Set(results.flatMap((r) => r.memoryIds))];
    const subjectIds = [...new Set(results.flatMap((r) => r.claim ? [r.claim.subjectNodeId] : []))];
    const [mems, prov] = await Promise.all([
      citedIds.length ? sb.from("memories").select("id, kind, contributor_id").eq("family_id", familyId).in("id", citedIds) : { data: [], error: null },
      subjectIds.length ? sb.from("provenance").select("node_id").in("node_id", subjectIds) : { data: [], error: null },
    ]);
    if (mems.error) throw mems.error;
    if (prov.error) throw prov.error;
    const info: GateInfo = { memoryKinds: {}, memoryOwners: {}, subjectProvenance: {} };
    for (const m of mems.data ?? []) { info.memoryKinds[m.id] = m.kind; info.memoryOwners[m.id] = m.contributor_id; }
    for (const p of prov.data ?? []) if (p.node_id) info.subjectProvenance[p.node_id] = true;
    const gate = evaluateGate(results, info);
    if (gate.decision === "silent") {
      await update({ gate, status: "silent", silence_reason: gate.reason, latency_ms: Date.now() - started });
      return NextResponse.json({ decision: "silent", reason: gate.reason, eventId });
    }
    await update({ gate });

    const [nodeRows, edgeRows] = await Promise.all([
      sb.from("graph_nodes").select("*").eq("family_id", familyId),
      sb.from("graph_edges").select("*").eq("family_id", familyId),
    ]);
    if (nodeRows.error) throw nodeRows.error;
    if (edgeRows.error) throw edgeRows.error;
    const nodes = nodeRows.data as GraphNodeRow[];
    const edges = edgeRows.data as GraphEdgeRow[];
    const subject = nodes.find((n) => n.id === gate.subjectNodeId);
    if (!subject) throw new Error("Recognized person no longer exists");
    const path = pickContextPath(subject.id, nodes, edges);
    const contextNodeIds = [subject.id, ...(path ? [path.node.id] : [])];
    const contextProv = await sb.from("provenance").select("memory_id").in("node_id", contextNodeIds);
    if (contextProv.error) throw contextProv.error;
    const answered = await sb.from("weaver_questions").select("answer_memory_id")
      .eq("family_id", familyId).eq("status", "answered").in("gap_node_id", contextNodeIds);
    if (answered.error) throw answered.error;
    const answerIds = new Set<string>((answered.data ?? []).flatMap((q) => q.answer_memory_id ? [q.answer_memory_id] : []));
    const contextIds = [...new Set([...(contextProv.data ?? []).map((p) => p.memory_id), ...answerIds])];
    let sources: CueMemory[] = [];
    if (contextIds.length) {
      const memories = await sb.from("memories").select("id, contributor_id, kind, transcript, created_at")
        .eq("family_id", familyId).in("id", contextIds);
      if (memories.error) throw memories.error;
      sources = (memories.data ?? []).map((m) => ({
        ...m, contributorName: relatives.data?.find((r) => r.id === m.contributor_id)?.name ?? "Your family",
        answersContext: answerIds.has(m.id),
      }));
    }
    const cue = synthesizeCue(subject, sources);
    let audio: string | null = null;
    try { audio = (await synthesizeSpeech(cue.text)).toString("base64"); } catch { /* Browser speech fallback. */ }
    const latencyMs = Date.now() - started;
    await update({ status: "speak", cue_text: cue.text, cue_source: cue.source, latency_ms: latencyMs });
    return NextResponse.json({ decision: "speak", cueText: cue.text, cueSource: cue.source, audio, eventId, latencyMs });
  } catch (error) {
    if (eventId) {
      // A service failure must terminate the Stage animation and remain silent.
      await getServiceClient().from("recall_events").update({
        status: "silent", gate: null, silence_reason: "Recall unavailable. Check services and try again.",
        latency_ms: Date.now() - started,
      }).eq("id", eventId);
    }
    return jsonError(error, "recall failed");
  }
}

export async function GET() {
  try {
    // Preserve the known-face demo even after the stranger/silence test.
    const sb = getServiceClient();
    const familyId = FAMILY_ID;
    const { data, error } = await sb.from("recall_events").select("id")
      .eq("family_id", familyId).eq("status", "speak").order("created_at", { ascending: false }).limit(1);
    if (error) throw error;
    return NextResponse.json({ lastEventId: data?.[0]?.id ?? null });
  } catch (error) { return jsonError(error, "failed to find a successful recall"); }
}
