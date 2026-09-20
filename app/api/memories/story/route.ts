import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { CONFIG } from "@/lib/config";
import { requireFamily, requireContributor } from "@/lib/auth/server";
import { transcribeTimedAudio } from "@/lib/providers/deepgram";
import { insertTimedMemory } from "@/lib/audio-segments";
import { embedText } from "@/lib/providers/ai";
import { extractMemory, applyExtraction } from "@/lib/extract";
import type { GraphNodeRow } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const { sb, familyId, relativeId } = await requireFamily({ contributor: true });
    const form = await req.formData();
    const file = form.get("file") as File | null;
    const contributorId = form.get("contributor_id") as string;
    requireContributor(relativeId, contributorId);
    if (!file || !contributorId) {
      return NextResponse.json({ error: "file and contributor_id required" }, { status: 400 });
    }
    if (file.size > CONFIG.maxUploadBytes) {
      return NextResponse.json({ error: "file too large" }, { status: 413 });
    }

    const topicId = form.get("topic_id");
    let topic: GraphNodeRow | null = null;
    if (topicId !== null) {
      if (typeof topicId !== "string" || !/^[0-9a-f-]{36}$/i.test(topicId)) {
        return NextResponse.json({ error: "Invalid story topic" }, { status: 400 });
      }
      const found = await sb.from("graph_nodes").select("*")
        .eq("id", topicId).eq("family_id", familyId).maybeSingle();
      if (found.error) throw found.error;
      if (!found.data) return NextResponse.json({ error: "Story topic not found" }, { status: 404 });
      topic = found.data;
    }

    const { data: contributor } = await sb
      .from("relatives")
      .select("*")
      .eq("id", contributorId)
      .eq("family_id", familyId)
      .single();
    if (!contributor) {
      return NextResponse.json({ error: "unknown contributor" }, { status: 400 });
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const ext = file.type.includes("mp4") || file.type.includes("m4a") ? "m4a" : "webm";
    const path = `${familyId}/${crypto.randomUUID()}.${ext}`;
    const upload = await sb.storage
      .from("media")
      .upload(path, bytes, { contentType: file.type || "audio/webm" });

    if (upload.error) throw upload.error;

    const { transcript, segments } = await transcribeTimedAudio(bytes, file.type || "audio/webm");
    if (!transcript) {
      return NextResponse.json({ error: "no speech detected" }, { status: 422 });
    }

    const { data: wearer } = await sb
      .from("wearer")
      .select("name")
      .eq("family_id", familyId)
      .single();
    const { data: existingNodes } = await sb
      .from("graph_nodes")
      .select("*")
      .eq("family_id", familyId);

    const extraction = await extractMemory({
      text: transcript,
      wearerName: wearer?.name ?? "the wearer",
      contributorName: contributor.name,
      contributorRelation: contributor.relation_to_wearer,
      existingNodes: (existingNodes ?? []) as GraphNodeRow[],
      questionContext: topic ? `What would you like to share about ${topic.label}?` : undefined,
      questionTarget: topic ? { nodeId: topic.id, gapType: "living_story" } : undefined,
    });

    const embedding = await embedText(extraction.summary).catch(
      () => new Array(1536).fill(0)
    );
    const { data: memory, error: memErr } = await insertTimedMemory(sb, {
        family_id: familyId,
        contributor_id: contributorId,
        kind: "story",
        media_path: path,
        transcript,
        summary: extraction.summary,
        embedding,
      }, segments);
    if (memErr) throw memErr;

    const applied = await applyExtraction(sb, {
      familyId: familyId,
      contributorId,
      memoryId: memory.id,
      extraction,
      wearerName: wearer?.name ?? "the wearer",
    });

    // An explicit contribution to a topic, not evidence for any new relationship.
    if (topic && !applied.nodeIds.includes(topic.id)) {
      const linked = await sb.from("provenance").insert({
        memory_id: memory.id, contributor_id: contributorId, node_id: topic.id,
      });
      if (linked.error) throw linked.error;
    }

    return NextResponse.json({
      memory_id: memory.id,
      transcript,
      summary: extraction.summary,
      entities: applied.chips,
    });
  } catch (e) {
    return jsonError(e, "story ingestion failed");
  }
}
