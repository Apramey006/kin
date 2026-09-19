import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { CONFIG } from "@/lib/config";
import { getServiceClient, FAMILY_ID } from "@/lib/supabase";
import { transcribeAudio } from "@/lib/providers/deepgram";
import { embedText } from "@/lib/providers/openai";
import { extractMemory, applyExtraction } from "@/lib/extract";
import type { GraphNodeRow } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const sb = getServiceClient();
    const form = await req.formData();
    const file = form.get("file") as File | null;
    const contributorId = form.get("contributor_id") as string;
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
      .single();
    if (!question) {
      return NextResponse.json({ error: "question not found" }, { status: 404 });
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const ext = file.type.includes("mp4") || file.type.includes("m4a") ? "m4a" : "webm";
    const path = `${FAMILY_ID}/${crypto.randomUUID()}.${ext}`;
    await sb.storage
      .from("media")
      .upload(path, bytes, { contentType: file.type || "audio/webm" });

    const transcript = await transcribeAudio(bytes, file.type || "audio/webm");
    if (!transcript) {
      return NextResponse.json({ error: "no speech detected" }, { status: 422 });
    }

    const { data: contributor } = await sb
      .from("relatives")
      .select("*")
      .eq("id", contributorId)
      .single();
    const { data: wearer } = await sb
      .from("wearer")
      .select("name")
      .eq("family_id", FAMILY_ID)
      .single();
    const { data: existingNodes } = await sb
      .from("graph_nodes")
      .select("*")
      .eq("family_id", FAMILY_ID);

    // The question text is passed as context so short answers resolve.
    const extraction = await extractMemory({
      text: transcript,
      wearerName: wearer?.name ?? "the wearer",
      contributorName: contributor?.name ?? "a relative",
      contributorRelation: contributor?.relation_to_wearer ?? "relative",
      existingNodes: (existingNodes ?? []) as GraphNodeRow[],
      questionContext: question.question_text,
    });

    const embedding = await embedText(extraction.summary).catch(
      () => new Array(1536).fill(0)
    );
    const { data: memory, error: memErr } = await sb
      .from("memories")
      .insert({
        family_id: FAMILY_ID,
        contributor_id: contributorId,
        kind: "answer",
        media_path: path,
        transcript,
        summary: extraction.summary,
        source_question_id: questionId,
        embedding,
      })
      .select()
      .single();
    if (memErr) throw memErr;

    const applied = await applyExtraction(sb, {
      familyId: FAMILY_ID,
      contributorId,
      memoryId: memory.id,
      extraction,
      wearerName: wearer?.name ?? "the wearer",
    });

    await sb
      .from("weaver_questions")
      .update({ status: "answered", answer_memory_id: memory.id })
      .eq("id", questionId);

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
