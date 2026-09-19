import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/server-faces", () => ({
  FACE_MODEL: "face-api-1.7.15:ssd-mobilenetv1:landmark68:recognition128:rgb-exif-v1",
  detectFaces: vi.fn(),
}));

import { detectFaces, FACE_MODEL } from "@/lib/server-faces";
import { IngestionError } from "../lib/ingestion/http";
import { resolveDescriptors, BROWSER_FACE_MODEL } from "../lib/faces-server";

const detectMock = vi.mocked(detectFaces);
const img = Buffer.from([1, 2, 3]);
const desc = (v: number) => new Array(128).fill(v);
const client = [desc(0.5)];

beforeEach(() => {
  detectMock.mockReset();
  detectMock.mockImplementation(async () => []);
});

describe("resolveDescriptors", () => {
  it("uses server descriptors when the service succeeds", async () => {
    detectMock.mockResolvedValue([
      { box: { x: 0, y: 0, width: 10, height: 10 }, descriptor: desc(0.1) },
      { box: { x: 5, y: 5, width: 10, height: 10 }, descriptor: desc(0.2) },
    ]);
    const res = await resolveDescriptors(img, "image/jpeg", client);
    expect(res.source).toBe("server");
    expect(res.model).toBe(FACE_MODEL);
    expect(res.descriptors).toHaveLength(2);
  });

  it("falls back to browser descriptors on 503 (service not configured)", async () => {
    detectMock.mockImplementation(async () => {
      throw new IngestionError(503, "not configured");
    });
    const res = await resolveDescriptors(img, "image/jpeg", client);
    expect(res.source).toBe("browser");
    expect(res.model).toBe(BROWSER_FACE_MODEL);
    expect(res.descriptors).toEqual(client);
  });

  it("yields none on inference failure (502)", async () => {
    detectMock.mockImplementation(async () => {
      throw new IngestionError(502, "inference failed");
    });
    const res = await resolveDescriptors(img, "image/jpeg", client);
    expect(res.source).toBe("none");
    expect(res.descriptors).toEqual([]);
  });

  it("returns browser descriptors when there is no snapshot", async () => {
    const res = await resolveDescriptors(null, "image/jpeg", client);
    expect(res.source).toBe("browser");
    expect(res.descriptors).toEqual(client);
    expect(detectMock).not.toHaveBeenCalled();
  });
});
