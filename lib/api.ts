import { NextResponse } from "next/server";

export function jsonError(e: unknown, fallback: string, status = 500) {
  void e;
  return NextResponse.json({ error: fallback }, { status });
}
