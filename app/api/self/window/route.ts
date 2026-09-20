import { NextResponse } from "next/server";
import { z } from "zod";
import { getServiceClient } from "@/lib/supabase";
import { authenticateIngestion } from "@/lib/ingestion/auth";
import { ingestionError, IngestionError } from "@/lib/ingestion/http";

export const runtime = "nodejs";

const windowSchema = z.object({ captureOpen: z.boolean() }).strict();

/**
 * The capture window is a contributor-side setting. Closing it never removes
 * anything from the wearer: they keep recording exactly as before, and their
 * stories wait for review instead of committing directly.
 */
async function loadSelf(req: Request) {
  const sb = getServiceClient();
  const identity = await authenticateIngestion(req, sb);
  if (identity.isSelf) throw new IngestionError(403, "Only family contributors can change this");
  const self = await sb.from("relatives").select("id, name, self_capture_open")
    .eq("family_id", identity.familyId).eq("is_self", true).maybeSingle();
  if (self.error) throw self.error;
  return { sb, identity, self: self.data };
}

export async function GET(req: Request) {
  try {
    const { self } = await loadSelf(req);
    return NextResponse.json({
      hasSelfKeeper: Boolean(self),
      name: self?.name ?? null,
      captureOpen: self ? self.self_capture_open !== false : null,
    });
  } catch (error) {
    return ingestionError(error);
  }
}

export async function PATCH(req: Request) {
  try {
    const { sb, identity, self } = await loadSelf(req);
    if (!self) throw new IngestionError(404, "This family has no personal memory keeper");
    const { captureOpen } = windowSchema.parse(await req.json());
    const updated = await sb.from("relatives").update({ self_capture_open: captureOpen })
      .eq("id", self.id).eq("family_id", identity.familyId).select("self_capture_open").single();
    if (updated.error) throw updated.error;
    return NextResponse.json({ captureOpen: updated.data.self_capture_open !== false });
  } catch (error) {
    return ingestionError(error);
  }
}
