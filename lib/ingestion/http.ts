import { NextResponse } from "next/server";
import { z } from "zod";
import { CONFIG } from "@/lib/config";

export class IngestionError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function ingestionError(error: unknown) {
  if (error instanceof IngestionError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof z.ZodError || error instanceof SyntaxError) {
    return NextResponse.json({ error: "Malformed input" }, { status: 400 });
  }
  return NextResponse.json({ error: "Ingestion failed; retry with the same request" }, { status: 502 });
}

export const idSchema = z.string().uuid();
export const familySchema = z.string().trim().min(1).max(128);

export async function multipart(req: Request) {
  if (!req.headers.get("content-type")?.startsWith("multipart/form-data")) {
    throw new IngestionError(415, "multipart/form-data required");
  }
  const length = Number(req.headers.get("content-length"));
  if (length > CONFIG.maxUploadBytes + 64 * 1024) {
    throw new IngestionError(413, "Upload too large");
  }
  try {
    return await req.formData();
  } catch {
    throw new IngestionError(400, "Malformed multipart body");
  }
}

const imageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const audioTypes = new Set([
  "audio/webm", "audio/mp4", "audio/m4a", "audio/x-m4a", "audio/mpeg",
  "audio/wav", "audio/x-wav", "audio/ogg", "audio/aac", "video/mp4",
]);

export async function upload(form: FormData, kind: "image" | "audio") {
  const file = form.get("file");
  if (!file || typeof file === "string" || typeof file.arrayBuffer !== "function") {
    throw new IngestionError(400, "file required");
  }
  if (file.size > CONFIG.maxUploadBytes) throw new IngestionError(413, "Upload too large");
  if (!file.size) throw new IngestionError(422, "Empty file");
  const mime = file.type.split(";")[0].trim().toLowerCase();
  if (!(kind === "image" ? imageTypes : audioTypes).has(mime)) {
    throw new IngestionError(415, `Unsupported ${kind} type`);
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  const isJpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const isPng = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const isWebp = bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
  if (kind === "image" && !({ "image/jpeg": isJpeg, "image/png": isPng, "image/webp": isWebp }[mime])) {
    throw new IngestionError(422, "Image contents do not match MIME type");
  }
  if (kind === "audio") {
    const header = bytes.toString("ascii", 0, 4);
    const valid = mime === "audio/webm" ? bytes.subarray(0, 4).equals(Buffer.from([26, 69, 223, 163]))
      : mime === "audio/ogg" ? header === "OggS"
      : mime.includes("wav") ? header === "RIFF" && bytes.toString("ascii", 8, 12) === "WAVE"
      : ["audio/mp4", "video/mp4", "audio/m4a", "audio/x-m4a"].includes(mime) ? bytes.toString("ascii", 4, 8) === "ftyp"
      : header.startsWith("ID3") || (bytes[0] === 255 && (bytes[1] & 224) === 224);
    if (!valid) throw new IngestionError(422, "Invalid audio container");
  }
  return { bytes, mime };
}
