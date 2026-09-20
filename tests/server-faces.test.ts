import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { descriptorSchema, detectFaces, extractFaceDescriptor, FACE_MODEL, sealFace } from "../lib/server-faces";

const image = { bytes: Buffer.from("server image bytes"), mime: "image/jpeg" };
const face = { box: { x: 0, y: 0, width: 20, height: 20 }, descriptor: Array(128).fill(0.1) };
const scope = { familyId: "670f5075-c286-4b29-8074-86401c18d0c0", contributorId: "contributor" };

beforeEach(() => {
  vi.stubEnv("KIN_FACE_TOKEN_KEY", "ab".repeat(32));
  vi.stubEnv("KIN_FACE_SERVICE_URL", "http://localhost:8100/detect");
  vi.stubEnv("KIN_FACE_SERVICE_TOKEN", "secret");
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });

describe("server face compatibility boundary", () => {
  it.each([[], Array(127).fill(0), Array(129).fill(0), [...Array(127).fill(0), NaN], [...Array(127).fill(0), Infinity], [...Array(127).fill(0), -Infinity]])("rejects invalid descriptor", (descriptor) => {
    expect(descriptorSchema.safeParse(descriptor).success).toBe(false);
  });
  it("binds selections to image, family, contributor and expiration", () => {
    const token = sealFace(image, face, scope);
    expect(extractFaceDescriptor(image, token, scope)).toEqual(face.descriptor);
    expect(() => extractFaceDescriptor({ ...image, bytes: Buffer.from("other") }, token, scope)).toThrow();
    expect(() => extractFaceDescriptor(image, token, { ...scope, familyId: "other" })).toThrow();
    expect(() => extractFaceDescriptor(image, token, { ...scope, contributorId: "other" })).toThrow();
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 16 * 60 * 1000);
    expect(() => extractFaceDescriptor(image, token, scope)).toThrow();
  });
  it.each([
    { model: "different-128-model", faces: [face] },
    { model: FACE_MODEL, faces: [{ ...face, descriptor: Array(127).fill(0) }] },
    { model: FACE_MODEL, faces: [{ ...face, box: { ...face.box, width: 1000 } }] },
  ])("rejects incompatible service output", async (result) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ width: 100, height: 100, ...result })));
    await expect(detectFaces(image)).rejects.toThrow();
  });
  it("runs the adapter in Node without DOM or native face-api imports", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ model: FACE_MODEL, width: 100, height: 100, faces: [face] })));
    expect(await detectFaces(image)).toEqual([face]);
    expect(fetch).toHaveBeenCalledWith("http://localhost:8100/detect", expect.objectContaining({ redirect: "error", headers: { authorization: "Bearer secret", "content-type": "image/jpeg" } }));
  });
  it("fails explicitly when inference is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")));
    await expect(detectFaces(image)).rejects.toThrow("Face inference failed");
    vi.stubEnv("KIN_FACE_SERVICE_URL", "");
    await expect(detectFaces(image)).rejects.toThrow("not configured");
  });
});
