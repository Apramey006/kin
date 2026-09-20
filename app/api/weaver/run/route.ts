import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { requireFamily } from "@/lib/auth/server";
import { runWeaver } from "@/lib/weaver";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST() {
  try {
    const { sb, familyId } = await requireFamily({ contributor: true });
    const { question, gap } = await runWeaver(sb, familyId);
    if (!question) {
      return NextResponse.json({ question: null, gap, message: "no gaps found" });
    }
    return NextResponse.json({ question, gap });
  } catch (e) {
    return jsonError(e, "weaver failed");
  }
}
