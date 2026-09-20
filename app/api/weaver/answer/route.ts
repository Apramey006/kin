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
    const questionId = form.get("question_id") as string;
    if (!file || !contributorId || !questionId) {
      return NextResponse.json(
        { error: "file, contributor_id and question_id required" },
        { status: 400 }
      );
    }
    if (file.size > CONFIG.maxUploadBytes) {
      return NextResponse.json({ error: "file too large" }, { status: 413 });
    }

    const { data: question } = await sb
      .from("weaver_questions")
      .select("*")
      .eq("id", questionId)
      .eq("family_id", familyId)
      .eq("target_relative_id", contributorId)
      .single();
    if (!question) {
      return NextResponse.json({ error: "question not found" }, { status: 404 });
    }

    if (question.status !== "open") return NextResponse.json({ error: "This question has already been answered" }, { status: 409 });

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

    const { data: contributor } = await sb
      .from("relatives")
      .select("*")
      .eq("id", contributorId)
      .eq("family_id", familyId)
      .single();
    const { data: wearer } = await sb
      .from("wearer")
      .select("name")
      .eq("family_id", familyId)
      .single();
    const { data: existingNodes } = await sb
      .from("graph_nodes")
      .select("*")
      .eq("family_id", familyId);

    // The question text is passed as context so short answers resolve.
    const extraction = await extractMemory({
      text: transcript,
      wearerName: wearer?.name ?? "the wearer",
      contributorName: contributor?.name ?? "a relative",
      contributorRelation: contributor?.relation_to_wearer ?? "relative",
      existingNodes: (existingNodes ?? []) as GraphNodeRow[],
      questionContext: question.question_text,
      questionTarget: question.gap_node_id ? { nodeId: question.gap_node_id, gapType: question.gap_type } : undefined,
    });

    const embedding = await embedText(extraction.summary).catch(
      () => new Array(1536).fill(0)
    );
    const { data: memory, error: memErr } = await insertTimedMemory(sb, {
        family_id: familyId,
        contributor_id: contributorId,
        kind: "answer",
        media_path: path,
        transcript,
        summary: extraction.summary,
        source_question_id: questionId,
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

    // Explicitly retain the question's subject even for short answers such as
    // "their mother's recipe". This link makes the answer available on replay.
    if (question.gap_node_id && !applied.nodeIds.includes(question.gap_node_id)) {
      const link = await sb.from("provenance").insert({ memory_id: memory.id,
        contributor_id: contributorId, node_id: question.gap_node_id });
      if (link.error) throw link.error;
    }
    const updated = await sb
      .from("weaver_questions")
      .update({ status: "answered", answer_memory_id: memory.id })
      .eq("id", questionId);
    if (updated.error) throw updated.error;

    return NextResponse.json({
      memory_id: memory.id,
      transcript,
      summary: extraction.summary,
      entities: applied.chips,
    });
  } catch (e) {
    return jsonError(e, "answer failed");
  }
}
