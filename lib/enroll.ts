import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

export const enrollmentSchema = z.object({
  person_node_id: z.string().uuid(),
  contributor_id: z.string().uuid(),
  memory_id: z.string().uuid(),
  descriptor: z.array(z.number().finite()).length(128),
});

export async function enrollFace(sb: SupabaseClient, familyId: string, input: z.infer<typeof enrollmentSchema>) {
  const [person, memory, provenance] = await Promise.all([
    sb.from("graph_nodes").select("id").eq("family_id", familyId).eq("id", input.person_node_id).eq("type", "person").single(),
    sb.from("memories").select("id").eq("family_id", familyId).eq("id", input.memory_id).eq("contributor_id", input.contributor_id).eq("kind", "photo").single(),
    sb.from("provenance").select("id").eq("node_id", input.person_node_id).eq("memory_id", input.memory_id).eq("contributor_id", input.contributor_id).limit(1),
  ]);
  if (person.error || memory.error || provenance.error || !provenance.data?.length) {
    throw new Error("Face enrollment requires this relative's photo labeled with this person");
  }
  const { error } = await sb.from("face_embeddings").insert({
    ...input, family_id: familyId, descriptor: JSON.stringify(input.descriptor),
  });
  if (error) throw error;
}
