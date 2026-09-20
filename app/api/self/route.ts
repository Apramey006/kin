import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { authenticateFamily } from "@/lib/ingestion/auth";
import { ingestionError, IngestionError } from "@/lib/ingestion/http";

export const runtime = "nodejs";

/**
 * The wearer's own Keeper. `/remember` needs the contributor id to submit,
 * because ingestion asserts the posted contributor matches the session.
 */
export async function GET(req: Request) {
  try {
    const sb = getServiceClient();
    const identity = await authenticateFamily(req, sb);
    if (!identity.isSelf || !identity.contributor) {
      throw new IngestionError(403, "This account has no personal memory keeper");
    }
    const wearer = await sb.from("wearer").select("name").eq("family_id", identity.familyId).maybeSingle();
    if (wearer.error) throw wearer.error;
    return NextResponse.json({
      contributorId: identity.contributorId,
      name: wearer.data?.name ?? identity.contributor.name,
      // Informational only. The capture UI is identical either way: a closed
      // window must never present itself to the wearer as a door shutting.
      captureOpen: identity.contributor.self_capture_open !== false,
    });
  } catch (error) {
    return ingestionError(error);
  }
}
