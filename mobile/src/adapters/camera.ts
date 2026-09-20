import { useCameraPermissions } from 'expo-camera';
import { useState, useRef, useEffect, useCallback } from 'react';
import type { CameraView } from 'expo-camera';

export interface CameraCaptureResult {
  uri: string;
  width: number;
  height: number;
}

// Face detection result: 'unknown' when the on-device detector is not
// available (e.g. Expo Go without the bundled module).
export type FaceCheck = 'face' | 'none' | 'unknown';

async function detectFacesIn(uri: string): Promise<number | null> {
  try {
    const FaceDetector = await import('expo-face-detector');
    const result = await FaceDetector.detectFacesAsync(uri, {
      mode: FaceDetector.FaceDetectorMode.fast,
      detectLandmarks: FaceDetector.FaceDetectorLandmarks.none,
      runClassifications: FaceDetector.FaceDetectorClassifications.none,
    });
    return result.faces.length;
  } catch (err) {
    // Module not bundled in this runtime, or detection failed.
    return null;
  }
}

export function useCameraAdapter() {
  const [permission, requestPermission] = useCameraPermissions();
  const [isReady, setIsReady] = useState(false);
  const cameraRef = useRef<CameraView | null>(null);

  useEffect(() => {
    setIsReady(permission?.granted === true);
  }, [permission]);

  const requestCameraPermission = useCallback(async (): Promise<boolean> => {
    if (!permission) {
      const result = await requestPermission();
      return result.granted;
    }
    return permission.granted;
  }, [permission, requestPermission]);

  const captureFrame = useCallback(async (): Promise<CameraCaptureResult | null> => {
    if (!cameraRef.current || !isReady) return null;
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.7,
        skipProcessing: false,
      });
      if (!photo) return null;
      return { uri: photo.uri, width: photo.width, height: photo.height };
    } catch (error) {
      console.error('Camera capture error:', error);
      return null;
    }
  }, [isReady]);

  // Capture a frame and report whether a face is present in it.
  const captureAndCheckFace = useCallback(async (): Promise<{
    frame: CameraCaptureResult | null;
    face: FaceCheck;
  }> => {
    const frame = await captureFrame();
    if (!frame) return { frame: null, face: 'unknown' };
    const count = await detectFacesIn(frame.uri);
    if (count === null) return { frame, face: 'unknown' };
    return { frame, face: count > 0 ? 'face' : 'none' };
  }, [captureFrame]);

  return {
    cameraRef,
    permission,
    isReady,
    requestCameraPermission,
    captureFrame,
    captureAndCheckFace,
  };
}
