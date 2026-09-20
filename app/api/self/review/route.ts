import { NextResponse } from "next/server";
import { z } from "zod";
import { getServiceClient } from "@/lib/supabase";
import { authenticateIngestion } from "@/lib/ingestion/auth";
import { idSchema, ingestionError, IngestionError } from "@/lib/ingestion/http";
import { commitIngestion } from "@/lib/ingestion/persist";

export const runtime = "nodejs";

const decisionSchema = z.object({
  id: idSchema,
  action: z.enum(["approve", "reject"]),
}).strict();

/** Pending self contributions awaiting a contributor's review. */
export async function GET(req: Request) {
  try {
    const sb = getServiceClient();
    const identity = await authenticateIngestion(req, sb);
    if (identity.isSelf) throw new IngestionError(403, "Contributors review these stories");
    const pending = await sb.from("pending_contributions")
      .select("id, kind, preview, media_path, created_at")
      .eq("family_id", identity.familyId).eq("state", "pending")
      .order("created_at", { ascending: false }).limit(50);
    if (pending.error) throw pending.error;
    return NextResponse.json({ pending: pending.data ?? [] });
  } catch (error) {
    return ingestionError(error);
  }
}

/**
 * Approving replays the stored payload through the same atomic RPC the direct
 * path uses, so an approved story is indistinguishable from one captured
 * inside the window. Rejecting records the decision and commits nothing.
 */
export async function POST(req: Request) {
  try {
    const sb = getServiceClient();
    const identity = await authenticateIngestion(req, sb);
    if (identity.isSelf) throw new IngestionError(403, "Contributors review these stories");
    const { id, action } = decisionSchema.parse(await req.json());

    const row = await sb.from("pending_contributions").select("*")
      .eq("id", id).eq("family_id", identity.familyId).maybeSingle();
    if (row.error) throw row.error;
    if (!row.data) throw new IngestionError(404, "Contribution not found");
    if (row.data.state !== "pending") throw new IngestionError(409, "Contribution already reviewed");

    if (action === "reject") {
      const rejected = await sb.from("pending_contributions")
        .update({ state: "rejected", reviewed_by: identity.contributorId, reviewed_at: new Date().toISOString() })
        .eq("id", id).eq("family_id", identity.familyId).eq("state", "pending").select("id").single();
      if (rejected.error) throw rejected.error;
      return NextResponse.json({ id, state: "rejected" });
    }

    const result = await commitIngestion(sb, row.data.payload as Record<string, unknown>);
    // commit_ingestion is idempotent by receipt, so a retry after a failed
    // state write re-commits harmlessly rather than duplicating the memory.
    const approved = await sb.from("pending_contributions")
      .update({ state: "approved", reviewed_by: identity.contributorId, reviewed_at: new Date().toISOString() })
      .eq("id", id).eq("family_id", identity.familyId).select("id").single();
    if (approved.error) throw approved.error;
    return NextResponse.json({ id, state: "approved", result });
  } catch (error) {
    return ingestionError(error);
  }
}
