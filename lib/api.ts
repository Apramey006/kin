import { NextResponse } from "next/server";

export function jsonError(e: unknown, fallback: string, status = 500) {
  if (e instanceof Error && "status" in e && typeof e.status === "number") return NextResponse.json({ error: e.message }, { status: e.status });
  return NextResponse.json({ error: fallback }, { status });
}
