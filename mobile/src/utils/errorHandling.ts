import { Alert, AppState, AppStateStatus } from 'react-native';
import { useState, useEffect } from 'react';

export class AppError extends Error {
  constructor(
    message: string,
    public code: string,
    public userMessage?: string,
    public recoverable: boolean = true
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const ErrorCodes = {
  CAMERA_PERMISSION_DENIED: 'CAMERA_PERMISSION_DENIED',
  MICROPHONE_PERMISSION_DENIED: 'MICROPHONE_PERMISSION_DENIED',
  PHOTO_LIBRARY_PERMISSION_DENIED: 'PHOTO_LIBRARY_PERMISSION_DENIED',
  CAMERA_NOT_READY: 'CAMERA_NOT_READY',
  NETWORK_ERROR: 'NETWORK_ERROR',
  API_ERROR: 'API_ERROR',
  RECORDING_ERROR: 'RECORDING_ERROR',
  PLAYBACK_ERROR: 'PLAYBACK_ERROR',
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  INVALID_FILE: 'INVALID_FILE',
  OPERATION_CANCELLED: 'OPERATION_CANCELLED',
  APP_IN_BACKGROUND: 'APP_IN_BACKGROUND',
} as const;

export function handleAppError(error: unknown): string {
  console.error('App error:', error);

  if (error instanceof AppError) {
    if (error.userMessage) {
      return error.userMessage;
    }
    
    switch (error.code) {
      case ErrorCodes.CAMERA_PERMISSION_DENIED:
        return 'Camera permission is required. Please enable it in settings.';
      case ErrorCodes.MICROPHONE_PERMISSION_DENIED:
        return 'Microphone permission is required. Please enable it in settings.';
      case ErrorCodes.PHOTO_LIBRARY_PERMISSION_DENIED:
        return 'Photo library permission is required. Please enable it in settings.';
      case ErrorCodes.CAMERA_NOT_READY:
        return 'Camera is not ready yet. Please wait a moment and try again.';
      case ErrorCodes.NETWORK_ERROR:
        return 'Network connection error. Please check your internet connection.';
      case ErrorCodes.API_ERROR:
        return 'Server error. Please try again later.';
      case ErrorCodes.RECORDING_ERROR:
        return 'Failed to record audio. Please try again.';
      case ErrorCodes.PLAYBACK_ERROR:
        return 'Failed to play audio. Please try again.';
      case ErrorCodes.FILE_TOO_LARGE:
        return 'File is too large. Please choose a smaller file.';
      case ErrorCodes.INVALID_FILE:
        return 'Invalid file format. Please choose a valid file.';
      case ErrorCodes.OPERATION_CANCELLED:
        return 'Operation was cancelled.';
      default:
        return 'An unexpected error occurred. Please try again.';
    }
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'An unexpected error occurred. Please try again.';
}

export function showErrorAlert(error: unknown, title: string = 'Error') {
  const userMessage = handleAppError(error);
  Alert.alert(title, userMessage);
}

export function isRecoverableError(error: unknown): boolean {
  if (error instanceof AppError) {
    return error.recoverable;
  }
  return true;
}

export function createError(
  code: keyof typeof ErrorCodes,
  message?: string,
  userMessage?: string,
  recoverable: boolean = true
): AppError {
  const defaultMessage = `Error: ${code}`;
  return new AppError(
    message || defaultMessage,
    ErrorCodes[code],
    userMessage,
    recoverable
  );
}

// Background detection utilities
export function useBackgroundDetection() {
  const [isInBackground, setIsInBackground] = useState(false);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      setIsInBackground(
        nextAppState === 'background' || nextAppState === 'inactive'
      );
    });

    return () => {
      subscription.remove();
    };
  }, []);

  return isInBackground;
}

// Network detection utilities
export async function checkNetworkConnection(): Promise<boolean> {
  try {
    // For now, we'll assume network is available
    // In production, you could implement a simple fetch check
    // or add a network detection library if needed
    return true;
  } catch {
    // Assume connection is available if check fails
    return true;
  }
}

// Retry utility with exponential backoff
export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (attempt === maxRetries - 1) {
        throw error;
      }
      
      const delay = baseDelay * Math.pow(2, attempt);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw new Error('Max retries exceeded');
}

// Debounce utility
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  
  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      timeout = null;
      func(...args);
    };
    
    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(later, wait);
  };
}

// Throttle utility
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;
  
  return function executedFunction(...args: Parameters<T>) {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}
