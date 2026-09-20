"use client";

type FaceApi = typeof import("@vladmandic/face-api");

let faceapiPromise: Promise<FaceApi> | null = null;
const getFaceApi = () =>
  (faceapiPromise ??= import("@vladmandic/face-api"));

let modelsReady: Promise<void> | null = null;

/** Load face-api weights once from /public/models and cache the promise. */
export function loadFaceModels(): Promise<void> {
  if (!modelsReady) {
    modelsReady = (async () => {
      const faceapi = await getFaceApi();
      await Promise.all([
        faceapi.nets.ssdMobilenetv1.loadFromUri("/models"),
        faceapi.nets.faceLandmark68Net.loadFromUri("/models"),
        faceapi.nets.faceRecognitionNet.loadFromUri("/models"),
      ]);
    })().catch((error) => {
      modelsReady = null;
      throw error;
    });
  }
  return modelsReady;
}

export interface DetectedFace {
  box: { x: number; y: number; width: number; height: number };
  descriptor: number[];
}

/** Detect all faces in an image/video/canvas and return boxes + 128-d descriptors. */
export async function detectFaces(
  input: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement
): Promise<DetectedFace[]> {
  const faceapi = await getFaceApi();
  await loadFaceModels();
  const detections = await faceapi
    .detectAllFaces(
      input,
      new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 })
    )
    .withFaceLandmarks()
    .withFaceDescriptors();
  return detections.map((d) => ({
    box: {
      x: d.detection.box.x,
      y: d.detection.box.y,
      width: d.detection.box.width,
      height: d.detection.box.height,
    },
    descriptor: Array.from(d.descriptor),
  }));
}
