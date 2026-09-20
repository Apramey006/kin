import { NextResponse } from "next/server";
import { z } from "zod";
import { getServiceClient } from "@/lib/supabase";
import { authenticateIngestion } from "@/lib/ingestion/auth";
import { idSchema, ingestionError, IngestionError } from "@/lib/ingestion/http";
import { selfRpc } from "@/lib/ingestion/self";

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

    return NextResponse.json(await selfRpc(sb, "review_self_contribution", {
      family: identity.familyId, reviewer: identity.contributorId, contribution: id, decision: action,
    }));
  } catch (error) {
    return ingestionError(error);
  }
}
