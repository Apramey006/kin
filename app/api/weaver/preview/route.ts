import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { authenticateIngestion } from "@/lib/ingestion/auth";
import { IngestionError, ingestionError } from "@/lib/ingestion/http";
import { familyRows, loadFamilyEvidence } from "@/lib/family-evidence";
import { pickTopGap, routeQuestion } from "@/lib/weaver";
import type { GraphEdgeRow, WeaverQuestionRow } from "@/lib/types";

export const dynamic = "force-dynamic";
/** A preview only. No LLM call, insertion, scheduling or automatic questions. */
export async function GET(req: Request) {
  try {
    const sb=getServiceClient();
    const identity=await authenticateIngestion(req,sb);
    if(identity.isSelf) throw new IngestionError(403,"Family contributors can explore missing context");
    const {familyId}=identity;
    const [evidence,edges,questions,faces]=await Promise.all([
      loadFamilyEvidence(sb,familyId), familyRows<GraphEdgeRow>(sb,"graph_edges",familyId),
      familyRows<WeaverQuestionRow>(sb,"weaver_questions",familyId),
      familyRows<{person_node_id:string}>(sb,"face_embeddings",familyId,"person_node_id"),
    ]);
    const data={...evidence,edges,facePersonIds:faces.map(f=>f.person_node_id),
      wearerNodeId:evidence.nodes.find(n=>n.relation_to_wearer==="self")?.id??null,
      openQuestionRelativeIds:questions.filter(q=>q.status==="open").map(q=>q.target_relative_id)};
    const gap=pickTopGap(data);
    let preview=null;
    if(gap) {
      const existing=questions.find(q=>q.status==="open"&&q.gap_node_id===gap.nodeId&&q.gap_type===gap.type);
      const targetId=existing?.target_relative_id??routeQuestion(data,gap);
      const label=evidence.nodes.find(n=>n.id===gap.nodeId)!.label;
      const question=existing?.question_text??(gap.type==="missing_origin" ? `Where did “${label}” begin?` : gap.type==="orphan_object" ? `What story connects “${label}” to your family?` : `How is ${label} connected to your family?`);
      preview={label,question,targetName:evidence.relatives.find(r=>r.id===targetId)?.name??null,state:existing?"asked":"suggested"};
    }
    return NextResponse.json({preview},{headers:{"Cache-Control":"private, no-store"}});
  } catch(error) { return ingestionError(error); }
}
