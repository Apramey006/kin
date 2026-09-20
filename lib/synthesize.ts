import { CONFIG } from "./config";
import { wordCount } from "./util";
import type { VerifiedFact } from "./types";

export interface CueDraft { factIds: string[]; cue: string }
export interface CueResult { text: string; grounded: boolean; factIds: string[] }

/** Extractive composition intentionally rejects even plausible paraphrases.
 * IDs alone are not grounding: every word must be an exact selected human fact.
 * Quotation marks preserve the contributor's perspective ("I", "we", "you"). */
export function renderFacts(facts: VerifiedFact[]): string {
  return facts.map(f => "A relative said: “" + f.text.trim() + "”").join(" ");
}

export function validateGrounding(draft: CueDraft, facts: VerifiedFact[]): boolean {
  if (!draft.factIds.length || new Set(draft.factIds).size !== draft.factIds.length) return false;
  const selected = draft.factIds.map(id => facts.find(f => f.id === id));
  if (selected.some(f => !f)) return false;
  return draft.cue === renderFacts(selected as VerifiedFact[]) && wordCount(draft.cue) <= CONFIG.cue.maxWords;
}

export async function synthesizeCue(input: {
  facts: VerifiedFact[];
  rewrite: (facts: VerifiedFact[]) => Promise<CueDraft>;
}): Promise<CueResult> {
  const facts = input.facts.filter(f => f.text.trim() && wordCount(renderFacts([f])) <= CONFIG.cue.maxWords);
  if (!facts.length) return { text: "", grounded: false, factIds: [] };
  try {
    const draft = await input.rewrite(facts);
    if (validateGrounding(draft, facts)) return { text: draft.cue, grounded: true, factIds: draft.factIds };
  } catch {
    // Safe local fallback uses the same independently validated human facts.
  }
  const selected = facts[0];
  return { text: renderFacts([selected]), grounded: true, factIds: [selected.id] };
}
