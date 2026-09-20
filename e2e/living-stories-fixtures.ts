import { test as base, expect } from "@playwright/test";
import type { FamilyData } from "../lib/family-data";
export const relativeId = "11111111-1111-4111-8111-111111111111";
export const memoryId = "22222222-2222-4222-8222-222222222222";
export const personId = "33333333-3333-4333-8333-333333333333";
export function familyFixture(): FamilyData {
  return {
    familyId: "browser-fixture",
    relativeId,
    isOwner: true,
    email: "maya@example.invalid",
    wearer: { family_id: "browser-fixture", name: "Rosa" },
    relatives: [
      {
        id: relativeId,
        family_id: "browser-fixture",
        name: "Maya",
        relation_to_wearer: "granddaughter",
        color: "#5845bb",
      },
    ],
    memories: [],
    nodes: [
      {
        id: personId,
        family_id: "browser-fixture",
        label: "Rosa",
        type: "person",
        aliases: [],
        relation_to_wearer: "self",
      },
    ],
    edges: [],
    provenance: [],
    events: [],
    questions: [],
    faces: [],
  };
}
export const test = base;
export { expect };
