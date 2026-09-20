import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { requireFamily, requireContributor } from "@/lib/auth/server";
import { enrollmentSchema, enrollFace } from "@/lib/enroll";

export const runtime = "nodejs";
export async function POST(req: Request) {
  try {
    const { sb, familyId, relativeId } = await requireFamily({ contributor: true });
    const body = enrollmentSchema.safeParse(await req.json());
    if (!body.success) return NextResponse.json({ error: "A labeled photo and a valid 128-value descriptor are required" }, { status: 400 });
    requireContributor(relativeId, body.data.contributor_id);
    await enrollFace(sb, familyId, body.data);
    return NextResponse.json({ ok: true });
  } catch (error) { return jsonError(error, "enroll failed"); }
}
