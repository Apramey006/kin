import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { authenticateFamily } from "@/lib/ingestion/auth";
import { ingestionError } from "@/lib/ingestion/http";

export async function GET(req: Request) {
  try {
    const sb = getServiceClient();
    const identity = await authenticateFamily(req, sb);
    const { familyId } = identity;
    const [nodes, edges, memories, relatives, questions] = await Promise.all([
      sb.from("graph_nodes").select("*").eq("family_id", familyId),
      sb.from("graph_edges").select("*").eq("family_id", familyId),
      sb.from("memories").select("id,family_id,contributor_id,kind,media_path,transcript,caption,summary,source_question_id,created_at").eq("family_id", familyId),
      sb.from("relatives").select("*").eq("family_id", familyId),
      sb.from("weaver_questions").select("*").eq("family_id", familyId),
    ]);
    for (const result of [nodes, edges, memories, relatives, questions]) if (result.error) throw result.error;
    const ids = (memories.data ?? []).map(memory => memory.id);
    const provenance = ids.length ? await sb.from("provenance").select("*").in("memory_id", ids) : { data: [], error: null };
    if (provenance.error) throw provenance.error;
    const sources = await Promise.all((memories.data ?? []).map(async memory => {
      let mediaUrl: string | null = null;
      if (memory.kind === "photo" && memory.media_path) {
        const signed = await sb.storage.from("media").createSignedUrl(memory.media_path, 3600);
        if (signed.error) throw signed.error;
        mediaUrl = signed.data.signedUrl;
      }
      return { ...memory, mediaUrl };
    }));
    return NextResponse.json({ familyId, relativeId: identity.contributorId,
      role: identity.isSelf ? "loved_one" : "contributor", nodes: nodes.data ?? [], edges: edges.data ?? [],
      memories: sources, relatives: relatives.data ?? [], questions: questions.data ?? [], provenance: provenance.data ?? [] },
      { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return ingestionError(error); }
}
