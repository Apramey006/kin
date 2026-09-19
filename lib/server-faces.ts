import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { z } from "zod";
import { digest } from "./ingestion/ids";
import { IngestionError } from "./ingestion/http";

export const FACE_MODEL = "face-api-1.7.15:ssd-mobilenetv1:landmark68:recognition128:rgb-exif-v1";
export const descriptorSchema = z.array(z.number().finite()).length(128);
export const boxSchema = z.object({
  x: z.number().finite().nonnegative(), y: z.number().finite().nonnegative(),
  width: z.number().finite().positive(), height: z.number().finite().positive(),
});
export interface FaceImage { bytes: Buffer; mime: string }
export interface FaceDetection { box: z.infer<typeof boxSchema>; descriptor: number[] }
export interface FaceScope { familyId: string; contributorId: string }

const inferenceSchema = z.object({
  model: z.literal(FACE_MODEL),
  width: z.number().int().positive().max(12000),
  height: z.number().int().positive().max(12000),
  faces: z.array(z.object({ box: boxSchema, descriptor: descriptorSchema })).max(32),
});

export async function detectFaces(image: FaceImage): Promise<FaceDetection[]> {
  const endpoint = process.env.KIN_FACE_SERVICE_URL;
  const token = process.env.KIN_FACE_SERVICE_TOKEN;
  if (!endpoint || !token) throw new IngestionError(503, "Face inference is not configured");
  let result: z.infer<typeof inferenceSchema>;
  try {
    const response = await fetch(endpoint, {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(20000),
      headers: { authorization: `Bearer ${token}`, "content-type": image.mime },
      body: new Uint8Array(image.bytes),
    });
    if (!response.ok) throw new Error("Face inference failed");
    result = inferenceSchema.parse(await response.json());
  } catch {
    throw new IngestionError(502, "Face inference failed or returned incompatible descriptors");
  }
  for (const face of result.faces) {
    if (face.box.x + face.box.width > result.width + 1 || face.box.y + face.box.height > result.height + 1) {
      throw new IngestionError(502, "Face box outside image");
    }
  }
  return result.faces;
}

function tokenKey() {
  const key = process.env.KIN_FACE_TOKEN_KEY;
  if (!key || !/^[a-f0-9]{64}$/i.test(key)) throw new IngestionError(503, "Face selection signing is not configured");
  return Buffer.from(key, "hex");
}

export function sealFace(image: FaceImage, face: FaceDetection, scope: FaceScope) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", tokenKey(), nonce);
  const payload = JSON.stringify({
    ...scope, hash: digest(image.bytes), model: FACE_MODEL, expires: Date.now() + 15 * 60 * 1000,
    box: boxSchema.parse(face.box), descriptor: descriptorSchema.parse(face.descriptor),
  });
  const encrypted = Buffer.concat([cipher.update(payload, "utf8"), cipher.final()]);
  return Buffer.concat([nonce, cipher.getAuthTag(), encrypted]).toString("base64url");
}

export function extractFaceDescriptor(image: FaceImage, selectedFace: string, scope: FaceScope): number[] {
  const key = tokenKey();
  try {
    if (selectedFace.length > 16000) throw new Error("Token too large");
    const bytes = Buffer.from(selectedFace, "base64url");
    const decipher = createDecipheriv("aes-256-gcm", key, bytes.subarray(0, 12));
    decipher.setAuthTag(bytes.subarray(12, 28));
    const payload = JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString());
    if (payload.hash !== digest(image.bytes) || payload.model !== FACE_MODEL ||
        !Number.isFinite(payload.expires) || payload.expires < Date.now() ||
        payload.familyId !== scope.familyId || payload.contributorId !== scope.contributorId) {
      throw new Error("Selection mismatch");
    }
    return descriptorSchema.parse(payload.descriptor);
  } catch {
    throw new IngestionError(422, "Invalid or expired face selection; detect faces again");
  }
}
