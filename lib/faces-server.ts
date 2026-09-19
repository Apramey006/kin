export type FaceDescriptorAdapter = (image: Buffer) => Promise<number[][]>;

export const notAvailable: FaceDescriptorAdapter = async () => {
  throw new Error("server face descriptors not available yet");
};

export let describeFaces: FaceDescriptorAdapter = notAvailable;

export function setFaceDescriptorAdapter(fn: FaceDescriptorAdapter) {
  describeFaces = fn;
}
