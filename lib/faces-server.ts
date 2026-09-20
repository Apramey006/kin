import type { SupabaseClient } from "@supabase/supabase-js";
import type { FaceOutcome } from "./types";
import { descriptorSchema, detectFaces, FACE_MODEL } from "./server-faces";

function setting(name: string, fallback: number, min: number, max: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < min || value > max) throw new Error("Invalid face matching configuration");
  return value;
}

/** Trusted identity comes exclusively from the same server pipeline used to enroll. */
export async function recognizeFace(sb: SupabaseClient, familyId: string, bytes: Buffer, mime: string): Promise<FaceOutcome> {
  const outcome = (status: "no_face" | "unknown" | "ambiguous" | "unavailable"): FaceOutcome => ({ status, model: FACE_MODEL });
  try {
    const faces = await detectFaces({ bytes, mime });
    if (!faces.length) return outcome("no_face");
    if (faces.length !== 1) return outcome("ambiguous");
    const maxDistance = setting("KIN_FACE_MAX_DISTANCE", 0.45, 0.01, 0.6);
    const margin = setting("KIN_FACE_MIN_MARGIN", 0.1, 0.05, 0.5);
    // Never truncate silently: omitted subjects could hide an ambiguous runner-up.
    const { data, error, count } = await sb.from("face_embeddings")
      .select("id,family_id,person_node_id,descriptor,model", { count: "exact" })
      .eq("family_id", familyId).eq("model", FACE_MODEL).limit(1001);
    if (error || !data || count === null || count !== data.length || data.length > 1000) return outcome("unavailable");
    const subjects = new Map<string, { distance: number; enrollmentIds: string[] }>();
    for (const row of data) {
      if (row.model !== FACE_MODEL || row.family_id !== familyId) continue;
      const descriptor = descriptorSchema.parse(typeof row.descriptor === "string" ? JSON.parse(row.descriptor) : row.descriptor);
      const distance = Math.sqrt(descriptor.reduce((sum, value, index) => sum + (value - faces[0].descriptor[index]) ** 2, 0));
      if (typeof row.id !== "string" || typeof row.person_node_id !== "string") return outcome("unavailable");
      const subject = subjects.get(row.person_node_id) ?? { distance: Infinity, enrollmentIds: [] };
      subject.distance = Math.min(subject.distance, distance);
      if (distance <= maxDistance) subject.enrollmentIds.push(row.id);
      subjects.set(row.person_node_id, subject);
    }
    const ranked = [...subjects.entries()].sort((a, b) => a[1].distance - b[1].distance);
    const best = ranked[0];
    if (!best || best[1].distance > maxDistance) return outcome("unknown");
    if (ranked[1] && ranked[1][1].distance - best[1].distance < margin) return outcome("ambiguous");
    return { status: "matched", subjectNodeId: best[0], model: FACE_MODEL,
      enrollmentIds: best[1].enrollmentIds.sort(), distance: best[1].distance,
      v: Math.max(0, Math.min(1, (0.6 - best[1].distance) / 0.25)) };
  } catch {
    return outcome("unavailable");
  }
}
