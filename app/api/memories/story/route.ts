import { getServiceClient, FAMILY_ID } from "@/lib/supabase";
import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { CONFIG } from "@/lib/config";
import { transcribeAudio } from "@/lib/providers/deepgram";
import { embedText } from "@/lib/providers/ai";
import { extractMemory, applyExtraction } from "@/lib/extract";
import type { GraphNodeRow } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const sb = getServiceClient();
    const familyId = FAMILY_ID;
    const form = await req.formData();
    const file = form.get("file") as File | null;
    const contributorId = form.get("contributor_id") as string;

    if (!file || !contributorId) {
      return NextResponse.json({ error: "file and contributor_id required" }, { status: 400 });
    }
    if (file.size > CONFIG.maxUploadBytes) {
      return NextResponse.json({ error: "file too large" }, { status: 413 });
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

    const transcript = await transcribeAudio(bytes, file.type || "audio/webm");
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
    });

    const embedding = await embedText(extraction.summary).catch(
      () => new Array(1536).fill(0)
    );
    const { data: memory, error: memErr } = await sb
      .from("memories")
      .insert({
        family_id: familyId,
        contributor_id: contributorId,
        kind: "story",
        media_path: path,
        transcript,
        summary: extraction.summary,
        embedding,
      })
      .select()
      .single();
    if (memErr) throw memErr;

    const applied = await applyExtraction(sb, {
      familyId: familyId,
      contributorId,
      memoryId: memory.id,
      extraction,
      wearerName: wearer?.name ?? "the wearer",
    });

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
