import type { SupabaseClient } from "@supabase/supabase-js";
import type { IngestionIdentity } from "./auth";
import { IngestionError } from "./http";

export async function existingSelfContribution(sb: SupabaseClient, identity: IngestionIdentity, id: string, hash: string) {
  const { data, error } = await sb.from("pending_contributions").select("payload,state")
    .eq("id", id).eq("family_id", identity.familyId).eq("contributor_id", identity.contributorId).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  if (data.payload.request_hash !== hash) throw new IngestionError(409, "Idempotency key already used with different content");
  if (data.state === "rejected") throw new IngestionError(409, "Contribution already rejected");
  return { ...data.payload.response, pending_review: data.state === "pending" };
}

export async function selfRpc(sb: SupabaseClient, name: "capture_self_contribution" | "review_self_contribution", args: Record<string, unknown>) {
  const { data, error } = await sb.rpc(name, args);
  if (error) {
    if (error.code === "23505") throw new IngestionError(409, "Contribution conflicts with an existing request or decision");
    if (error.code === "P0002") throw new IngestionError(404, "Contribution not found");
    if (error.code === "42501") throw new IngestionError(403, "Family membership required");
    if (["PGRST202", "42883"].includes(error.code)) throw new IngestionError(503, "Self-contribution migration 007 required");
    throw error;
  }
  if (!data) throw new Error("Missing self-contribution result");
  return data;
}
