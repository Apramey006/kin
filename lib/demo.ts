/** Existing shared demo family: keep these IDs across seed, auth and Atlas. */
export const DEMO_FAMILY_ID = "670f5075-c286-4b29-8074-86401c18d0c0";
export const DEMO_CONTRIBUTOR_IDS = {
  maya: "6ba867ac-36ef-432a-8306-1ce7f5df5289",
  david: "adc50d52-40d5-48d6-8ce5-804724c71c49",
  elena: "54d2a843-200b-4a8f-b1d0-6fe280d1e527",
} as const;
export const DEMO_ACCOUNTS = [
  { name: "Maya", email: "maya@demo.kin.test", role: "organizer", contributorId: DEMO_CONTRIBUTOR_IDS.maya },
  { name: "David", email: "david@demo.kin.test", role: "contributor", contributorId: DEMO_CONTRIBUTOR_IDS.david },
  { name: "Elena", email: "elena@demo.kin.test", role: "contributor", contributorId: DEMO_CONTRIBUTOR_IDS.elena },
  { name: "Rosa", email: "rosa@demo.kin.test", role: "wearer", contributorId: null },
] as const;
