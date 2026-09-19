import { detectFaces, FACE_MODEL } from "./server-faces";
import { IngestionError } from "./ingestion/http";

export const BROWSER_FACE_MODEL = "browser-face-api-1.7.15";

export type DescriptorSource = "server" | "browser" | "none";

export interface DescriptorResult {
  descriptors: number[][];
  model: string;
  source: DescriptorSource;
}

const browserResult = (clientDescriptors: number[][]): DescriptorResult =>
  clientDescriptors.length
    ? { descriptors: clientDescriptors, model: BROWSER_FACE_MODEL, source: "browser" }
    : { descriptors: [], model: BROWSER_FACE_MODEL, source: "none" };

/**
 * Server descriptors when the face service is configured; falls back to client
 * descriptors only when the service is NOT configured (503). Inference failure
 * (502 etc.) yields none so recall stays silent.
 */
export async function resolveDescriptors(
  snapshot: Buffer | null,
  mime: string,
  clientDescriptors: number[][]
): Promise<DescriptorResult> {
  if (!snapshot) return browserResult(clientDescriptors);
  try {
    const faces = await detectFaces({ bytes: snapshot, mime });
    return {
      descriptors: faces.map((f) => f.descriptor),
      model: FACE_MODEL,
      source: "server",
    };
  } catch (e) {
    if (e instanceof IngestionError && e.status === 503) {
      return browserResult(clientDescriptors);
    }
    return { descriptors: [], model: FACE_MODEL, source: "none" };
  }
}
