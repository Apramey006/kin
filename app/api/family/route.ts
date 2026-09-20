import { NextResponse } from "next/server";
import { requireFamily } from "@/lib/auth/server";
import { jsonError } from "@/lib/api";
export async function GET() {
  try {
    const { sb, familyId, relativeId, isOwner, user, role } =
      await requireFamily();
    const [
      wearer,
      relatives,
      memories,
      nodes,
      edges,
      events,
      questions,
      faces,
    ] = await Promise.all([
      sb.from("wearer").select("*").eq("family_id", familyId).single(),
      sb.from("relatives").select("*").eq("family_id", familyId),
      sb
        .from("memories")
        .select(
          "id,family_id,contributor_id,kind,media_path,transcript,caption,summary,source_question_id,created_at,source,verified_facts",
        )
        .eq("family_id", familyId)
        .order("created_at", { ascending: false }),
      sb.from("graph_nodes").select("*").eq("family_id", familyId),
      sb.from("graph_edges").select("*").eq("family_id", familyId),
      sb
        .from("recall_events")
        .select(
          "id,family_id,status,keeper_results,gate,cue_text,evidence,selected_fact_ids,reason_code,face_outcome,silence_reason,latency_ms,created_at",
        )
        .eq("family_id", familyId)
        .order("created_at", { ascending: false })
        .limit(8),
      sb
        .from("weaver_questions")
        .select("*")
        .eq("family_id", familyId)
        .order("created_at", { ascending: false }),
      sb
        .from("face_embeddings")
        .select("person_node_id,contributor_id,memory_id")
        .eq("family_id", familyId),
    ]);
    for (const result of [
      wearer,
      relatives,
      memories,
      nodes,
      edges,
      events,
      questions,
      faces,
    ])
      if (result.error) throw result.error;
    const members = await sb
      .from("family_members")
      .select("*")
      .eq("family_id", familyId);
    if (members.error && !["42P01", "PGRST205"].includes(members.error.code)) throw members.error;
    const wearerAccount = await sb.from("wearer_accounts").select("user_id").eq("family_id",familyId).limit(1);
    if(wearerAccount.error) throw wearerAccount.error;
    const ids = memories.data!.map((m) => m.id);
    const provenance = ids.length
      ? await sb.from("provenance").select("*").in("memory_id", ids)
      : { data: [], error: null };
    if (provenance.error) throw provenance.error;
    const paths = memories.data!.flatMap((m) =>
      m.media_path ? [m.media_path] : [],
    );
    const signed = paths.length
      ? await sb.storage.from("media").createSignedUrls(paths, 3600)
      : { data: [], error: null };
    const mediaUrls = Object.fromEntries(
      (signed.data ?? [])
        .filter((s) => s.signedUrl)
        .map((s) => [s.path, s.signedUrl]),
    );
    return NextResponse.json(
      {
        familyId,
        relativeId,
        role,
        lovedOneConnected:
          Boolean(members.data?.some((m) => m.role === "loved_one") || wearerAccount.data?.length),
        isOwner,
        email: user.email,
        wearer: wearer.data,
        relatives: relatives.data,
        memories: memories.data!.map((m) => ({
          ...m,
          mediaUrl: m.media_path ? (mediaUrls[m.media_path] ?? null) : null,
        })),
        nodes: nodes.data,
        edges: edges.data,
        events: events.data,
        questions: questions.data,
        faces: faces.data,
        provenance: provenance.data,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return jsonError(e, "Your family couldn't be loaded. Please try again.");
  }
}
