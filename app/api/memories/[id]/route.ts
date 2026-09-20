import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError } from "@/lib/api";
import { requireFamily, requireContributor } from "@/lib/auth/server";
import { deleteMemory } from "@/lib/delete-memory";

export const runtime = "nodejs";

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { sb, familyId, relativeId } = await requireFamily({ contributor: true });
    const input = z.object({ memoryId: z.string().uuid(), contributorId: z.string().uuid() }).safeParse({
      memoryId: (await params).id, contributorId: new URL(req.url).searchParams.get("contributor_id"),
    });
    if (!input.success) return NextResponse.json({ error: "Valid memory and contributor IDs are required" }, { status: 400 });
    requireContributor(relativeId, input.data.contributorId);
    const removed = await deleteMemory(sb, familyId, input.data.contributorId, input.data.memoryId);
    if (!removed) return NextResponse.json({ error: "Memory not found for this relative" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) { return jsonError(error, "Could not finish deleting this memory. Please try again."); }
}
