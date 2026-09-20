import type { FaceOutcome, GraphNodeRow } from "./types";
export interface RecordedCheck { id: string; family_id: string; status: string; face_outcome: FaceOutcome | null; created_at: string }
export function recordedMatches(familyId: string, from: Date, to: Date, events: RecordedCheck[], nodes: GraphNodeRow[]) {
  return events.flatMap(event => {
    const time = new Date(event.created_at).getTime();
    if (event.family_id !== familyId || !["speak","silent"].includes(event.status) ||
      !Number.isFinite(time) || time < from.getTime() || time >= to.getTime() || event.face_outcome?.status !== "matched") return [];
    const subjectId = event.face_outcome.subjectNodeId;
    const person = nodes.find(n=>n.family_id===familyId && n.type==="person" && n.id===subjectId);
    return person ? [{ id:event.id, at:event.created_at, person, cueAvailable:event.status==="speak" }] : [];
  });
}
