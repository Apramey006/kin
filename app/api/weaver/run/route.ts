import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { requireFamily } from "@/lib/auth/server";
import { runWeaver } from "@/lib/weaver";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const { sb, familyId } = await requireFamily({ contributor: true });
    const topicId = new URL(req.url).searchParams.get("topic");
    if (topicId && !/^[0-9a-f-]{36}$/i.test(topicId)) return NextResponse.json({ error: "Invalid story topic" }, { status: 400 });
    const { question, gap } = await runWeaver(sb, familyId, topicId ?? undefined);
    if (!question) {
      return NextResponse.json({ question: null, gap, message: "no gaps found" });
    }
    return NextResponse.json({ question, gap });
  } catch (e) {
    return jsonError(e, "weaver failed");
  }
}
