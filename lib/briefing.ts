import { humanFacts, hasExplicitDispute } from "./keepers";
import type { GraphNodeRow, MemoryRow, ProvenanceRow, Relative, VerifiedFact } from "./types";

export interface MemoryContextFact extends VerifiedFact { speaker: string; sourceText: string }
export interface MemoryContext {
  person: { id: string; name: string; relationship: string | null };
  facts: MemoryContextFact[];
  supporters: string[];
  memoryCount: number;
  mode: "prepare" | "recall";
}
export interface Briefing {
  status: "ready" | "insufficient" | "disputed";
  context: MemoryContext;
}

export function contributorName(id: string, relatives: Relative[]): string {
  const owner = relatives.find(r => r.id === id);
  return owner?.is_self ? "You" : owner?.name?.trim() || "A family member";
}

export function relationshipText(relation: string | null): string | null {
  const value = relation?.trim();
  if (!value || value.toLowerCase() === "self") return null;
  // Do not invent a relationship or mechanically prepend "Your" to arbitrary text.
  return /^(sister|brother|mother|father|daughter|son|granddaughter|grandson|grandmother|grandfather|aunt|uncle|cousin|niece|nephew|wife|husband|partner|friend|neighbor|neighbour)$/i.test(value)
    ? `Your ${value.toLowerCase()}` : value;
}

export function contextFacts(memories: MemoryRow[], personId: string, relatives: Relative[]): MemoryContextFact[] {
  return memories.flatMap(m => humanFacts(m, personId).map(f => ({ ...f,
    speaker: contributorName(f.contributorId, relatives), sourceText: m.transcript || m.source?.caption || "",
  })));
}

/** Manual browsing, not recognition: never create a synthetic face/gate score.
 * Require scoped, literal human facts + direct subject provenance + two owners.
 * A denial anywhere in the eligible evidence withholds the entire briefing. */
export function buildBriefing(familyId: string, person: GraphNodeRow, memories: MemoryRow[], provenance: ProvenanceRow[], relatives: Relative[]): Briefing {
  const owners = relatives.filter(r => r.family_id === familyId);
  const eligible = memories.filter(m => m.family_id === familyId && owners.some(r => r.id === m.contributor_id) &&
    provenance.some(p => p.memory_id === m.id && p.contributor_id === m.contributor_id && p.node_id === person.id));
  const facts = contextFacts(eligible, person.id, owners);
  const ids = [...new Set(facts.map(f => f.contributorId))];
  const status = person.family_id !== familyId || person.type !== "person" ? "insufficient"
    : facts.some(f => hasExplicitDispute(f.text)) ? "disputed" : ids.length < 2 ? "insufficient" : "ready";
  // Favor a short literal anchor, then interleave perspectives for optional context.
  const shared = (text: string) => /\b(together|used to|every)\b/i.test(text) ? 1 : 0;
  const sorted = [...facts].sort((a,b) => shared(b.text) - shared(a.text) || a.text.split(/\s+/).length - b.text.split(/\s+/).length || a.id.localeCompare(b.id));
  const seen = new Set<string>();
  const first = sorted.filter(f => { if (seen.has(f.contributorId)) return false; seen.add(f.contributorId); return true; });
  const remaining = sorted.filter(f => !first.includes(f));
  return { status, context: { mode: "prepare",
    person: { id: person.id, name: person.label, relationship: relationshipText(person.relation_to_wearer) },
    facts: status === "ready" ? [...first, ...remaining] : [],
    supporters: status === "ready" ? ids.map(id => contributorName(id, owners)) : [],
    memoryCount: status === "ready" ? new Set(facts.map(f => f.memoryId)).size : 0,
  } };
}
