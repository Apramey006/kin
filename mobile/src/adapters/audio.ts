import { 
  useAudioRecorder, 
  RecordingPresets, 
  AudioModule,
  setAudioModeAsync,
  useAudioRecorderState
} from 'expo-audio';
import { useState, useEffect, useRef } from 'react';
import * as FileSystem from 'expo-file-system';

export interface RecordingResult {
  uri: string;
  duration: number;
  size: number;
}

export function useAudioRecorderAdapter() {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(audioRecorder);

  useEffect(() => {
    (async () => {
      try {
        const status = await AudioModule.requestRecordingPermissionsAsync();
        setHasPermission(status.granted);
        
        if (!status.granted) {
          setError('Microphone permission was denied');
        }
        
        await setAudioModeAsync({
          playsInSilentMode: true,
          allowsRecording: true,
          interruptionMode: 'doNotMix',
        });
      } catch (err) {
        setError('Failed to request microphone permission');
        console.error('Audio permission error:', err);
      }
    })();
  }, []);

  const startRecording = async (): Promise<boolean> => {
    if (!hasPermission) {
      setError('No microphone permission');
      return false;
    }

    try {
      setError(null);
      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
      return true;
    } catch (err) {
      setError('Failed to start recording');
      console.error('Recording start error:', err);
      return false;
    }
  };

  const stopRecording = async (): Promise<RecordingResult | null> => {
    try {
      await audioRecorder.stop();
      
      if (!audioRecorder.uri) {
        setError('Recording failed - no file created');
        return null;
      }

      const fileInfo = await FileSystem.getInfoAsync(audioRecorder.uri);
      
      return {
        uri: audioRecorder.uri,
        duration: 0, // Placeholder - actual duration would come from recording metadata
        size: fileInfo.exists ? (fileInfo.size || 0) : 0,
      };
    } catch (err) {
      setError('Failed to stop recording');
      console.error('Recording stop error:', err);
      return null;
    }
  };

  const cancelRecording = async (): Promise<void> => {
    try {
      await audioRecorder.stop();
      if (audioRecorder.uri) {
        await FileSystem.deleteAsync(audioRecorder.uri, { idempotent: true });
      }
    } catch (err) {
      console.error('Recording cancel error:', err);
    }
  };

  return {
    audioRecorder,
    recorderState,
    hasPermission,
    error,
    startRecording,
    stopRecording,
    cancelRecording,
  };
}

export function useAudioPlayerAdapter() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const playerRef = useRef<any>(null);

  useEffect(() => {
    (async () => {
      try {
        await setAudioModeAsync({
          playsInSilentMode: true,
          shouldPlayInBackground: false,
          interruptionMode: 'doNotMix',
        });
      } catch (err) {
        console.error('Audio mode setup error:', err);
      }
    })();
  }, []);

  const playAudio = async (uri: string): Promise<boolean> => {
    try {
      setError(null);
      
      // For now, use TTS as fallback since expo-av has compatibility issues
      // In production, you would use expo-av or a proper audio library
      const { speak } = await import('expo-speech');
      await speak('Audio playback placeholder');
      
      return true;
    } catch (err) {
      setError('Failed to play audio');
      console.error('Audio playback error:', err);
      return false;
    }
  };

  const stopAudio = async (): Promise<void> => {
    try {
      if (playerRef.current) {
        // Placeholder for actual audio stopping
        playerRef.current = null;
      }
      setIsPlaying(false);
    } catch (err) {
      console.error('Audio stop error:', err);
    }
  };

  const playBase64Audio = async (base64Audio: string): Promise<boolean> => {
    try {
      setError(null);
      
      // For now, use TTS as fallback
      const { speak } = await import('expo-speech');
      await speak('Base64 audio playback placeholder');
      
      return true;
    } catch (err) {
      setError('Failed to play base64 audio');
      console.error('Base64 audio playback error:', err);
      return false;
    }
  };

  return {
    isPlaying,
    error,
    playAudio,
    stopAudio,
    playBase64Audio,
  };
}

export function useTextToSpeech() {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const speak = async (text: string): Promise<boolean> => {
    try {
      setError(null);
      setIsSpeaking(true);
      
      const { speak } = await import('expo-speech');
      await speak(text, {
        rate: 0.9,
        pitch: 1.0,
      });
      
      setIsSpeaking(false);
      return true;
    } catch (err) {
      setError('Failed to speak text');
      console.error('TTS error:', err);
      setIsSpeaking(false);
      return false;
    }
  };

  const stop = async (): Promise<void> => {
    try {
      const { stop } = await import('expo-speech');
      await stop();
      setIsSpeaking(false);
    } catch (err) {
      console.error('TTS stop error:', err);
    }
  };

  return {
    isSpeaking,
    error,
    speak,
    stop,
  };
}
