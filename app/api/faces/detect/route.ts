import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { authenticateIngestion } from "@/lib/ingestion/auth";
import { ingestionError, multipart, upload } from "@/lib/ingestion/http";
import { detectFaces, sealFace } from "@/lib/server-faces";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const identity = await authenticateIngestion(req, getServiceClient());
    const image = await upload(await multipart(req), "image");
    const detections = await detectFaces(image);
    return NextResponse.json({ faces: detections.map((face) => ({
      temporaryFaceId: sealFace(image, face, identity), box: face.box,
    })) });
  } catch (error) {
    return ingestionError(error);
  }
}
