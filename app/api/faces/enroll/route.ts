import { NextResponse } from "next/server";
import { z } from "zod";
import { getServiceClient } from "@/lib/supabase";
import { authenticateIngestion, assertOwnership } from "@/lib/ingestion/auth";
import { idSchema, ingestionError, IngestionError } from "@/lib/ingestion/http";
import { digest, stableId } from "@/lib/ingestion/ids";
import { commitIngestion, existingReceipt } from "@/lib/ingestion/persist";
import { extractFaceDescriptor, FACE_MODEL } from "@/lib/server-faces";

export const runtime = "nodejs";

const enrollmentSchema = z.object({
  person_node_id: idSchema, contributor_id: idSchema, memory_id: idSchema,
  family_id: z.string().optional(), temporaryFaceId: z.string().min(1).max(16000), consent: z.literal(true),
}).strict();

export async function POST(req: Request) {
  try {
    const sb = getServiceClient();
    const identity = await authenticateIngestion(req, sb);
    const body = enrollmentSchema.parse(await req.json());
    assertOwnership(identity, body.contributor_id, body.family_id);
    const [{ data: memory, error: memoryError }, { data: person, error: personError }] = await Promise.all([
      sb.from("memories").select("*").eq("id", body.memory_id).eq("family_id", identity.familyId)
        .eq("contributor_id", identity.contributorId).eq("kind", "photo").maybeSingle(),
      sb.from("graph_nodes").select("id").eq("id", body.person_node_id).eq("family_id", identity.familyId).eq("type", "person").maybeSingle(),
    ]);
    if (memoryError) throw memoryError;
    if (personError) throw personError;
    if (!memory?.media_path || !person) throw new IngestionError(403, "Photo or person does not belong to this family and contributor");
    const stored = await sb.storage.from("media").download(memory.media_path);
    if (stored.error || !stored.data) throw new Error("Source photo unavailable");
    const image = { bytes: Buffer.from(await stored.data.arrayBuffer()), mime: stored.data.type };
    const descriptor = extractFaceDescriptor(image, body.temporaryFaceId, identity);
    const id = stableId(identity.familyId, identity.contributorId, body.memory_id, "face", digest(JSON.stringify(descriptor)));
    const requestHash = digest(JSON.stringify({ memory: body.memory_id, person: body.person_node_id, descriptor, consent: true }));
    const prior = await existingReceipt(sb, identity, id, requestHash);
    if (prior) return NextResponse.json(prior);
    const result = await commitIngestion(sb, {
      id, request_hash: requestHash, family_id: identity.familyId, contributor_id: identity.contributorId,
      face: { id, family_id: identity.familyId, person_node_id: body.person_node_id, contributor_id: identity.contributorId,
        memory_id: body.memory_id, descriptor },
      source: { type: "human", user_id: identity.userId, consent: true, model: FACE_MODEL },
      response: { ok: true, face_id: id, model: FACE_MODEL },
    });
    return NextResponse.json(result);
  } catch (error) {
    return ingestionError(error);
  }
}
