import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { authenticateFamily } from "@/lib/ingestion/auth";
import { idSchema, IngestionError, ingestionError } from "@/lib/ingestion/http";
import { loadFamilyEvidence } from "@/lib/family-evidence";
import { buildBriefing } from "@/lib/briefing";

export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  try {
    const sb = getServiceClient();
    const { familyId } = await authenticateFamily(req,sb);
    const requested = new URL(req.url).searchParams.get("person");
    const personId = requested === null ? null : idSchema.parse(requested);
    const data = await loadFamilyEvidence(sb,familyId);
    const people = data.nodes.filter(n => n.family_id === familyId && n.type === "person" && n.relation_to_wearer !== "self")
      .sort((a,b)=>a.label.localeCompare(b.label));
    if (personId && !people.some(p=>p.id===personId)) throw new IngestionError(404,"Person not found in your family");
    const briefings = (personId ? people.filter(p=>p.id===personId) : people)
      .map(p=>buildBriefing(familyId,p,data.memories,data.provenance,data.relatives));
    return NextResponse.json({ briefings },{ headers: { "Cache-Control":"private, no-store" } });
  } catch (error) { return ingestionError(error); }
}
