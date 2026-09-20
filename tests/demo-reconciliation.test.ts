import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DEMO_ACCOUNTS, DEMO_FAMILY_ID } from "../lib/demo";
import { demoDataset, seedDemo, resetFamily } from "../lib/seed";
import baseline from "../demo/shared-baseline.json";

vi.mock("../lib/providers/openai", () => ({ embedText: async () => Array(1536).fill(0) }));
type Row = Record<string, unknown>;
function database() {
  const tables: Record<string, Row[]> = {};
  const sb = { storage: { from: () => ({ list: async () => ({ data: [], error: null }) }) }, from: (table: string) => {
    tables[table] ??= [];
    const filters: [string, unknown][] = [];
    let deleting = false;
    let update: Row | undefined;
    const matches = (row: Row) => filters.every(([key, value]) => row[key] === value);
    const q = { select: () => q, eq: (key: string, value: unknown) => { filters.push([key, value]); return q; },
      maybeSingle: async () => ({ data: tables[table].find(matches) ?? null, error: null }),
      delete: () => { deleting = true; return q; },
      update: (values: Row) => { update = values; return q; },
      upsert: async (rows: Row[], options: { ignoreDuplicates?: boolean }) => {
        expect(options.ignoreDuplicates).toBe(true);
        for (const row of rows) if (!tables[table].some(r => (r.id ?? r.family_id) === (row.id ?? row.family_id))) tables[table].push(row);
        return { error: null };
      },
      then: (resolve: (value: unknown) => unknown) => {
        if (update) tables[table].filter(matches).forEach(row => Object.assign(row, update));
        if (deleting) {
          const removed = tables[table].filter(matches);
          tables[table] = tables[table].filter(r => !matches(r));
          if (table === "memories") tables.provenance = (tables.provenance ?? []).filter(p => !removed.some(m => m.id === p.memory_id));
        }
        return Promise.resolve({ data: tables[table].filter(matches), error: null }).then(resolve);
      },
    }; return q;
  } } as unknown as SupabaseClient;
  return { sb, tables };
}
describe("one canonical judging baseline", () => {
  it("retains all shared memories, graph relationships and real contributor IDs", () => {
    const data = demoDataset(DEMO_FAMILY_ID);
    expect(data.relatives).toEqual(baseline.relatives);
    for (const memory of baseline.memories) expect(data.memories).toContainEqual(expect.objectContaining(memory));
    for (const edge of baseline.graph_edges) expect(data.edges).toContainEqual(edge);
    expect(new Set(data.edges.map(e => `${e.from_node}:${e.rel}:${e.to_node}`)).size).toBe(data.edges.length);
    expect(DEMO_ACCOUNTS[3]).toMatchObject({ name: "Rosa", contributorId: null });
  });
  it("additive seed preserves new content; repeated seed and reset-seed retain mappings without duplicates", async () => {
    const { sb, tables } = database();
    await seedDemo(sb, DEMO_FAMILY_ID);
    const original = structuredClone(tables);
    tables.memories.push({ id: "new-user-story", family_id: DEMO_FAMILY_ID, summary: "Keep this new story" });
    await seedDemo(sb, DEMO_FAMILY_ID);
    expect(tables.memories).toHaveLength(original.memories.length + 1);
    expect(tables.graph_edges).toEqual(original.graph_edges);
    tables.wearer_accounts = [{ user_id: "existing-rosa", family_id: DEMO_FAMILY_ID }];
    const self = { id: "self", family_id: DEMO_FAMILY_ID, is_self: true, self_capture_open: false };
    tables.relatives.push(self);
    tables.pending_contributions = [{ id: "held", family_id: DEMO_FAMILY_ID, state: "pending" }];
    await resetFamily(sb, DEMO_FAMILY_ID);
    await seedDemo(sb, DEMO_FAMILY_ID);
    expect(tables.memories).toEqual(original.memories);
    expect(tables.graph_edges).toEqual(original.graph_edges);
    expect(tables.relatives).toEqual([...original.relatives, { ...self, self_capture_open: true }]);
    expect(tables.pending_contributions).toEqual([]);
    expect(tables.wearer_accounts).toHaveLength(1);
  });
  it("refuses legacy or parallel demo seed targets", async () => {
    await expect(seedDemo(database().sb, "demo")).rejects.toThrow("canonical");
  });
});
