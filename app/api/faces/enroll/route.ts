import { getServiceClient, FAMILY_ID } from "@/lib/supabase";
import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { enrollmentSchema, enrollFace } from "@/lib/enroll";

export const runtime = "nodejs";
export async function POST(req: Request) {
  try {
    const sb = getServiceClient();
    const familyId = FAMILY_ID;
    const body = enrollmentSchema.safeParse(await req.json());
    if (!body.success) return NextResponse.json({ error: "A labeled photo and a valid 128-value descriptor are required" }, { status: 400 });

    await enrollFace(sb, familyId, body.data);
    return NextResponse.json({ ok: true });
  } catch (error) { return jsonError(error, "enroll failed"); }
}
