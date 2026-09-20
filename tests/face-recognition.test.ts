import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { recognizeFace } from "../lib/faces-server";
import { FACE_MODEL, detectFaces } from "../lib/server-faces";

vi.mock("../lib/server-faces", async (original) => ({ ...await original<typeof import("../lib/server-faces")>(), detectFaces: vi.fn() }));
const vector = (distance = 0) => [distance, ...Array(127).fill(0)];
const face = { box: { x: 0, y: 0, width: 10, height: 10 }, descriptor: vector() };
const row = (id: string, person: string, distance: number, model: string | null = FACE_MODEL, family = "670f5075-c286-4b29-8074-86401c18d0c0") =>
  ({ id, person_node_id: person, descriptor: JSON.stringify(vector(distance)), model, family_id: family });
function database(rows: ReturnType<typeof row>[], error: unknown = null) {
  const chain = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue({ data: rows, error, count: rows.length }) };
  const sb = { from: vi.fn().mockReturnValue(chain) };
  return { sb: sb as unknown as SupabaseClient, chain };
}
afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); });
describe("trusted server snapshot recognition", () => {
  it("forwards original snapshot and matches model-tagged family enrollment", async () => {
    vi.mocked(detectFaces).mockResolvedValue([face]);
    const { sb, chain } = database([row("enrollment", "nora", .2)]);
    const bytes = Buffer.from("test snapshot mock");
    expect(await recognizeFace(sb, "670f5075-c286-4b29-8074-86401c18d0c0", bytes, "image/jpeg")).toEqual({ status: "matched", model: FACE_MODEL, subjectNodeId: "nora", enrollmentIds: ["enrollment"], distance: .2, v: 1 });
    expect(detectFaces).toHaveBeenCalledWith({ bytes, mime: "image/jpeg" });
    expect(chain.eq).toHaveBeenCalledWith("family_id", "670f5075-c286-4b29-8074-86401c18d0c0");
    expect(chain.eq).toHaveBeenCalledWith("model", FACE_MODEL);
  });
  it.each([[[], "no_face"], [[face, face], "ambiguous"]] as const)("does not query enrollments for invalid face count", async (faces, status) => {
    vi.mocked(detectFaces).mockResolvedValue([...faces]);
    const { sb } = database([]);
    expect((await recognizeFace(sb, "670f5075-c286-4b29-8074-86401c18d0c0", Buffer.alloc(0), "image/png")).status).toBe(status);
    expect(sb.from).not.toHaveBeenCalled();
  });
  it.each([
    [[], "unknown"],
    [[row("far", "nora", .46)], "unknown"],
    [[row("legacy", "nora", 0, null)], "unknown"],
    [[row("wrong-model", "nora", 0, "other")], "unknown"],
    [[row("wrong-family", "nora", 0, FACE_MODEL, "other")], "unknown"],
    [[row("a", "nora", .2), row("b", "other", .25)], "ambiguous"],
    [[row("a", "nora", .2), row("b", "nora", .21)], "matched"],
  ] as const)("fails closed or aggregates only compatible subject enrollments", async (rows, status) => {
    vi.mocked(detectFaces).mockResolvedValue([face]);
    expect((await recognizeFace(database([...rows]).sb, "670f5075-c286-4b29-8074-86401c18d0c0", Buffer.alloc(0), "image/png")).status).toBe(status);
  });
  it("returns unavailable for provider, database, malformed vector and truncation failures", async () => {
    vi.mocked(detectFaces).mockRejectedValueOnce(new Error("offline"));
    expect((await recognizeFace(database([]).sb, "670f5075-c286-4b29-8074-86401c18d0c0", Buffer.alloc(0), "image/png")).status).toBe("unavailable");
    vi.mocked(detectFaces).mockResolvedValue([face]);
    for (const db of [database([], { code: "XX" }), database([{ ...row("a", "nora", 0), descriptor: "[0]" }]), database(Array(1001).fill(row("a", "nora", 0)))]) {
      expect((await recognizeFace(db.sb, "670f5075-c286-4b29-8074-86401c18d0c0", Buffer.alloc(0), "image/png")).status).toBe("unavailable");
    }
  });
  it("rejects unsafe matching configuration", async () => {
    vi.mocked(detectFaces).mockResolvedValue([face]);
    vi.stubEnv("KIN_FACE_MAX_DISTANCE", "2");
    expect((await recognizeFace(database([row("a", "nora", 0)]).sb, "670f5075-c286-4b29-8074-86401c18d0c0", Buffer.alloc(0), "image/png")).status).toBe("unavailable");
  });
  it("rejects a server row cap that hides a possible runner-up", async () => {
    vi.mocked(detectFaces).mockResolvedValue([face]);
    const { sb, chain } = database([row("a", "nora", 0)]);
    chain.limit.mockResolvedValue({ data: [row("a", "nora", 0)], error: null, count: 2 });
    expect((await recognizeFace(sb, "670f5075-c286-4b29-8074-86401c18d0c0", Buffer.alloc(0), "image/png")).status).toBe("unavailable");
  });
});
