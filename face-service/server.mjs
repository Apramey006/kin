import http from "node:http";
import { timingSafeEqual } from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";
import sharp from "sharp";

const require = createRequire(import.meta.url);
const faceapi = require("@vladmandic/face-api/dist/face-api.node.js");
const model = "face-api-1.7.15:ssd-mobilenetv1:landmark68:recognition128:rgb-exif-v1";
const secret = process.env.KIN_FACE_SERVICE_TOKEN;
if (!secret) throw new Error("KIN_FACE_SERVICE_TOKEN required");
const weights = process.env.KIN_FACE_WEIGHTS ?? path.resolve("public/models");
await Promise.all([
  faceapi.nets.ssdMobilenetv1.loadFromDisk(weights),
  faceapi.nets.faceLandmark68Net.loadFromDisk(weights),
  faceapi.nets.faceRecognitionNet.loadFromDisk(weights),
]);
let busy = false;

http.createServer(async (request, response) => {
  const supplied = Buffer.from(request.headers.authorization ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  const send = (status, body) => {
    response.writeHead(status, { "content-type": "application/json" });
    response.end(JSON.stringify(body));
  };
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    send(401, { error: "Unauthorized" });
    return;
  }
  if (request.method !== "POST" || request.url !== "/detect") {
    send(404, { error: "Not found" });
    return;
  }
  if (!["image/jpeg", "image/png", "image/webp"].includes(request.headers["content-type"])) {
    send(415, { error: "Unsupported image" });
    return;
  }
  if (busy) {
    send(503, { error: "Inference busy; retry" });
    return;
  }
  busy = true;
  let tensor;
  try {
    const chunks = [];
    let size = 0;
    for await (const chunk of request) {
      size += chunk.length;
      if (size > 15 * 1024 * 1024) {
        send(413, { error: "Image too large" });
        return;
      }
      chunks.push(chunk);
    }
    const { data, info } = await sharp(Buffer.concat(chunks), { limitInputPixels: 24000000, failOn: "warning" })
      .rotate().flatten({ background: "white" }).removeAlpha().toColourspace("srgb")
      .raw().toBuffer({ resolveWithObject: true });
    tensor = faceapi.tf.tensor3d(new Uint8Array(data), [info.height, info.width, 3], "int32");
    const detections = await faceapi.detectAllFaces(tensor,
      new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5, maxResults: 32 }))
      .withFaceLandmarks().withFaceDescriptors();
    const faces = detections.map((face) => ({
      box: { x: face.detection.box.x, y: face.detection.box.y, width: face.detection.box.width, height: face.detection.box.height },
      descriptor: Array.from(face.descriptor),
    }));
    if (faces.some((face) => face.descriptor.length !== 128 || face.descriptor.some((value) => !Number.isFinite(value)))) {
      throw new Error("Invalid descriptor");
    }
    send(200, { model, width: info.width, height: info.height, faces });
  } catch {
    send(422, { error: "Image decoding or inference failed" });
  } finally {
    tensor?.dispose();
    busy = false;
  }
}).listen(Number(process.env.PORT ?? 8100), process.env.KIN_FACE_BIND ?? "127.0.0.1");
