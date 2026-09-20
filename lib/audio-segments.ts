import type { SupabaseClient } from "@supabase/supabase-js";
import type { AudioSegment } from "./living-stories";

/** Rolling deployment: recordings still save before migration 005 is applied. */
export async function insertTimedMemory(sb: SupabaseClient, row: Record<string, unknown>, segments: AudioSegment[]) {
  const result = await sb.from("memories").insert({ ...row, audio_segments: segments }).select().single();
  const missingColumn = ["42703", "PGRST204"].includes(result.error?.code ?? "") &&
    result.error?.message.includes("audio_segments");
  if (missingColumn) return sb.from("memories").insert(row).select().single();
  return result;
}
