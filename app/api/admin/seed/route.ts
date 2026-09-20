import { NextResponse } from "next/server";

// Demo administration is available only through local CLI scripts.
export async function POST() {
  return NextResponse.json({ error: "Demo administration is not available in the app." }, { status: 410 });
}
