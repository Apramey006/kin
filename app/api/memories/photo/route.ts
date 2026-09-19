import { ingestMemory } from "@/lib/ingestion/memory";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  return ingestMemory(req, "photo");
}
