import { NextResponse } from "next/server";
import { AccessError } from "./auth/server";

export function jsonError(e: unknown, fallback: string, status = 500) {
  return NextResponse.json({ error: e instanceof Error ? e.message : fallback }, { status: e instanceof AccessError ? e.status : status });
}
