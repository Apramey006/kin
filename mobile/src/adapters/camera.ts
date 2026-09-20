import { CameraView, useCameraPermissions } from 'expo-camera';
import { useState, useRef, useEffect } from 'react';

export interface CameraCaptureResult {
  uri: string;
  width: number;
  height: number;
}

export interface FaceDetectionResult {
  descriptor: number[];
  box: { x: number; y: number; width: number; height: number };
}

export function useCameraAdapter() {
  const [permission, requestPermission] = useCameraPermissions();
  const [isReady, setIsReady] = useState(false);
  const cameraRef = useRef<any>(null);

  useEffect(() => {
    setIsReady(permission?.granted === true);
  }, [permission]);

  const requestCameraPermission = async (): Promise<boolean> => {
    if (!permission) {
      const result = await requestPermission();
      return result.granted;
    }
    return permission.granted;
  };

  const captureFrame = async (): Promise<CameraCaptureResult | null> => {
    if (!cameraRef.current || !isReady) {
      return null;
    }

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.85,
        skipProcessing: true,
      });

      if (!photo) {
        return null;
      }

      return {
        uri: photo.uri,
        width: photo.width,
        height: photo.height,
      };
    } catch (error) {
      console.error('Camera capture error:', error);
      return null;
    }
  };

  const detectFaces = async (imageUri: string): Promise<FaceDetectionResult[]> => {
    // This is a placeholder implementation. In a real implementation, you would
    // use a face detection library or integrate with the backend's face detection API.
    // For now, we return empty results to maintain the interface.
    
    return [];
  };

  return {
    cameraRef,
    permission,
    isReady,
    requestCameraPermission,
    captureFrame,
    detectFaces,
  };
}
