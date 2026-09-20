import {
  useAudioRecorder,
  useAudioRecorderState,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  setIsAudioActiveAsync,
  createAudioPlayer,
  type AudioPlayer,
  type AudioStatus,
} from 'expo-audio';
import { useState, useEffect, useRef, useCallback } from 'react';
import * as FileSystem from 'expo-file-system/legacy';
import * as Speech from 'expo-speech';

export interface RecordingResult {
  uri: string;
  duration: number; // seconds
  size: number;
}

export function useAudioRecorderAdapter() {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  const audioRecorder = useAudioRecorder({
    ...RecordingPresets.HIGH_QUALITY,
    isMeteringEnabled: true,
  });
  const recorderState = useAudioRecorderState(audioRecorder, 200);

  const ensurePermission = useCallback(async (): Promise<boolean> => {
    try {
      const status = await requestRecordingPermissionsAsync();
      setHasPermission(status.granted);
      if (!status.granted) {
        setError('Microphone access is turned off. Allow it in Settings, then try again.');
      }
      return status.granted;
    } catch (err) {
      setError('Failed to request microphone permission');
      return false;
    }
  }, []);

  const startRecording = useCallback(async (): Promise<boolean> => {
    const granted = hasPermission ?? (await ensurePermission());
    if (!granted) return false;
    try {
      setError(null);
      await setAudioModeAsync({
        playsInSilentMode: true,
        allowsRecording: true,
        interruptionMode: 'doNotMix',
      });
      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
      return true;
    } catch (err) {
      setError('Could not start recording.');
      return false;
    }
  }, [audioRecorder, hasPermission, ensurePermission]);

  const stopRecording = useCallback(async (): Promise<RecordingResult | null> => {
    try {
      const duration = (recorderState.durationMillis ?? 0) / 1000;
      await audioRecorder.stop();
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
      if (!audioRecorder.uri) {
        setError('Nothing was recorded. Give it another try.');
        return null;
      }
      const fileInfo = await FileSystem.getInfoAsync(audioRecorder.uri);
      return {
        uri: audioRecorder.uri,
        duration,
        size: fileInfo.exists ? (fileInfo.size ?? 0) : 0,
      };
    } catch (err) {
      setError('Failed to stop recording');
      return null;
    }
  }, [audioRecorder, recorderState.durationMillis]);

  const cancelRecording = useCallback(async (): Promise<void> => {
    try {
      await audioRecorder.stop();
      if (audioRecorder.uri) {
        await FileSystem.deleteAsync(audioRecorder.uri, { idempotent: true });
      }
    } catch (err) {
      // Recorder may already be stopped.
    }
  }, [audioRecorder]);

  return {
    audioRecorder,
    recorderState,
    hasPermission,
    error,
    setError,
    ensurePermission,
    startRecording,
    stopRecording,
    cancelRecording,
  };
}

// Plays a local file or remote URI once, reporting state for the UI.
export function useAudioPlayerAdapter() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const playerRef = useRef<AudioPlayer | null>(null);
  const subRef = useRef<{ remove: () => void } | null>(null);

  const release = useCallback(() => {
    subRef.current?.remove();
    subRef.current = null;
    if (playerRef.current) {
      try {
        playerRef.current.remove();
      } catch {}
      playerRef.current = null;
    }
    setIsPlaying(false);
  }, []);

  useEffect(() => release, [release]);

  const playUri = useCallback(
    async (uri: string): Promise<boolean> => {
      try {
        setError(null);
        release();
        await setAudioModeAsync({
          playsInSilentMode: true,
          shouldPlayInBackground: false,
          interruptionMode: 'doNotMix',
        });
        await setIsAudioActiveAsync(true);
        const player = createAudioPlayer({ uri });
        playerRef.current = player;
        subRef.current = player.addListener(
          'playbackStatusUpdate',
          (status: AudioStatus) => {
            setIsPlaying(status.playing);
            if (status.didJustFinish) release();
          },
        );
        player.play();
        setIsPlaying(true);
        return true;
      } catch (err) {
        setError('Failed to play audio');
        return false;
      }
    },
    [release],
  );

  // Decode a base64 audio payload to a cache file, then play it.
  const playBase64Audio = useCallback(
    async (base64Audio: string, extension: string = 'mp3'): Promise<boolean> => {
      try {
        const path = `${FileSystem.cacheDirectory}kin-cue-${Date.now()}.${extension}`;
        await FileSystem.writeAsStringAsync(path, base64Audio, {
          encoding: FileSystem.EncodingType.Base64,
        });
        return await playUri(path);
      } catch (err) {
        setError('Failed to play audio');
        return false;
      }
    },
    [playUri],
  );

  return { isPlaying, error, playUri, playBase64Audio, stopAudio: release };
}

export function useTextToSpeech() {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const speak = useCallback(async (text: string): Promise<boolean> => {
    try {
      setError(null);
      setIsSpeaking(true);
      Speech.speak(text, {
        rate: 0.92,
        pitch: 1.0,
        onDone: () => setIsSpeaking(false),
        onStopped: () => setIsSpeaking(false),
        onError: () => setIsSpeaking(false),
      });
      return true;
    } catch (err) {
      setError('Failed to speak text');
      setIsSpeaking(false);
      return false;
    }
  }, []);

  const stop = useCallback(async (): Promise<void> => {
    try {
      Speech.stop();
      setIsSpeaking(false);
    } catch {}
  }, []);

  return { isSpeaking, error, speak, stop };
}
