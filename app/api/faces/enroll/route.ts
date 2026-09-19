import { NextResponse } from "next/server";
import { getServiceClient, FAMILY_ID } from "@/lib/supabase";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const sb = getServiceClient();
    const body = await req.json();
    const { person_node_id, contributor_id, memory_id, descriptor } = body as {
      person_node_id: string;
      contributor_id: string;
      memory_id: string;
      descriptor: number[];
    };
    if (
      !person_node_id ||
      !contributor_id ||
      !memory_id ||
      !Array.isArray(descriptor) ||
      descriptor.length !== 128
    ) {
      return NextResponse.json(
        { error: "person_node_id, contributor_id, memory_id and a 128-d descriptor are required" },
        { status: 400 }
      );
    }
    const { error } = await sb.from("face_embeddings").insert({
      family_id: FAMILY_ID,
      person_node_id,
      contributor_id,
      memory_id,
      descriptor: JSON.stringify(descriptor),
    });
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "enroll failed" },
      { status: 500 }
    );
  }
}
