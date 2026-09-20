import { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, AppState, AppStateStatus } from 'react-native';
import { useRouter } from 'expo-router';
import { useCameraAdapter } from '../src/adapters/camera';
import { CameraView } from 'expo-camera';
import { useAudioPlayerAdapter, useTextToSpeech } from '../src/adapters/audio';
import { useFixtures, fixtureWearer } from '../src/fixtures/data';
import { COLORS, SPACING, BORDER_RADIUS, SHADOWS } from '../src/theme/colors';
import { TEXT_STYLES, TYPOGRAPHY } from '../src/theme/typography';

type Phase = 'idle' | 'thinking' | 'cue';

export default function CompanionScreen() {
  const router = useRouter();
  const { wearer } = useFixtures(true);
  
  const [phase, setPhase] = useState<Phase>('idle');
  const [cueText, setCueText] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  
  const cueTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backgroundRef = useRef<string>('active');

  const {
    cameraRef,
    permission,
    isReady,
    requestCameraPermission,
    captureFrame,
  } = useCameraAdapter();

  const {
    isPlaying,
    error: audioError,
    playBase64Audio,
    stopAudio,
  } = useAudioPlayerAdapter();

  const {
    isSpeaking,
    speak,
    stop: stopSpeaking,
  } = useTextToSpeech();

  useEffect(() => {
    const subscription = AppState.addEventListener('change', handleAppStateChange);
    
    (async () => {
      const hasPermission = await requestCameraPermission();
      if (!hasPermission) {
        setCameraError('Camera permission is required for this feature');
      }
    })();

    return () => {
      subscription.remove();
      if (cueTimerRef.current) {
        clearTimeout(cueTimerRef.current);
      }
      stopAudio();
      stopSpeaking();
    };
  }, []);

  const handleAppStateChange = (nextAppState: AppStateStatus) => {
    if (backgroundRef.current.match(/inactive|background/) && nextAppState === 'active') {
      // App came back from background, reset to idle
      setPhase('idle');
      setCueText(null);
      stopAudio();
      stopSpeaking();
    }
    backgroundRef.current = nextAppState;
  };

  const handleTap = async () => {
    if (phase !== 'idle' || processing) return;
    
    if (cueTimerRef.current) {
      clearTimeout(cueTimerRef.current);
      cueTimerRef.current = null;
    }

    if (!isReady) {
      setCameraError('Camera is not ready yet');
      return;
    }

    setPhase('thinking');
    setCueText(null);
    setCameraError(null);
    setProcessing(true);

    try {
      const frame = await captureFrame();
      
      if (!frame) {
        setCameraError('Failed to capture frame');
        setPhase('idle');
        setProcessing(false);
        return;
      }

      // In production, this would call the recall API
      // const response = await apiClient.recall(file, faceDescriptors);
      
      // For now, simulate the API call with fixtures
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Simulate a successful response 50% of the time
      const shouldSpeak = Math.random() > 0.5;
      
      if (shouldSpeak) {
        const mockCueText = "That's Maya, your granddaughter. You saw her last week at the birthday party.";
        setCueText(mockCueText);
        setPhase('cue');
        
        // Try to play audio, fall back to TTS
        const audioSuccess = await playBase64Audio(''); // Empty base64 for demo
        if (!audioSuccess) {
          await speak(mockCueText);
        }
        
        // Auto-dismiss cue after 8 seconds
        cueTimerRef.current = setTimeout(() => {
          setPhase('idle');
          setCueText(null);
          stopAudio();
          stopSpeaking();
        }, 8000);
      } else {
        // Silent response - insufficient evidence
        setPhase('idle');
      }
    } catch (error) {
      console.error('Recall error:', error);
      setCameraError('Something went wrong. Please try again.');
      setPhase('idle');
    } finally {
      setProcessing(false);
    }
  };

  if (!permission) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Loading camera...</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorTitle}>Camera Permission Required</Text>
        <Text style={styles.errorText}>
          Kin needs camera access to identify family members and provide memory cues.
        </Text>
        <TouchableOpacity
          style={styles.permissionButton}
          onPress={requestCameraPermission}
        >
          <Text style={styles.permissionButtonText}>Grant Permission</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Text style={styles.backButtonText}>Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.appName}>Kin</Text>
        <Text style={styles.wearerName}>{wearer?.name || 'Family Member'}</Text>
      </View>

      <View style={styles.cameraContainer}>
        <CameraView
          ref={cameraRef}
          style={styles.camera}
          facing="back"
          onCameraReady={() => setCameraError(null)}
        />
        
        {cameraError && (
          <View style={styles.cameraError}>
            <Text style={styles.cameraErrorText}>{cameraError}</Text>
          </View>
        )}

        {phase === 'cue' && cueText && (
          <View style={styles.cueContainer}>
            <Text style={styles.cueText}>{cueText}</Text>
          </View>
        )}
      </View>

      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={[
            styles.mainButton,
            phase === 'thinking' && styles.thinkingButton,
            phase === 'cue' && styles.cueButton,
          ]}
          onPress={handleTap}
          disabled={phase !== 'idle' || processing}
          accessible={true}
          accessibilityLabel="Who is this?"
          accessibilityRole="button"
          accessibilityHint="Tap to identify who you're looking at"
        >
          <Text style={styles.buttonText}>
            {phase === 'thinking' ? 'Thinking…' : phase === 'cue' ? 'Listening…' : 'Who is this?'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.paper,
  },
  loadingText: {
    ...TEXT_STYLES.bodyLarge,
    color: COLORS.inkLight,
    textAlign: 'center',
  },
  errorTitle: {
    ...TEXT_STYLES.h2,
    color: COLORS.ink,
    textAlign: 'center',
    marginBottom: SPACING.lg,
  },
  errorText: {
    ...TEXT_STYLES.body,
    color: COLORS.inkLight,
    textAlign: 'center',
    marginBottom: SPACING.xxl,
    paddingHorizontal: SPACING.xxxl,
  },
  permissionButton: {
    backgroundColor: COLORS.primary,
    padding: SPACING.lg,
    borderRadius: BORDER_RADIUS.md,
    alignItems: 'center',
    marginHorizontal: SPACING.xxxl,
    marginBottom: SPACING.lg,
  },
  permissionButtonText: {
    ...TEXT_STYLES.body,
    fontWeight: TYPOGRAPHY.weights.semibold,
    color: COLORS.white,
  },
  backButton: {
    backgroundColor: COLORS.inkLighter,
    padding: SPACING.lg,
    borderRadius: BORDER_RADIUS.md,
    alignItems: 'center',
    marginHorizontal: SPACING.xxxl,
  },
  backButtonText: {
    ...TEXT_STYLES.body,
    fontWeight: TYPOGRAPHY.weights.semibold,
    color: COLORS.white,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.lg,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  appName: {
    ...TEXT_STYLES.h3,
    color: COLORS.primary,
  },
  wearerName: {
    ...TEXT_STYLES.body,
    color: COLORS.inkLight,
  },
  cameraContainer: {
    flex: 1,
    position: 'relative',
    backgroundColor: COLORS.stage,
  },
  camera: {
    flex: 1,
  },
  cameraError: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    padding: SPACING.xxxl,
  },
  cameraErrorText: {
    ...TEXT_STYLES.bodyLarge,
    color: COLORS.white,
    textAlign: 'center',
  },
  cueContainer: {
    position: 'absolute',
    bottom: SPACING.xl,
    left: SPACING.xl,
    right: SPACING.xl,
    backgroundColor: 'rgba(255,255,255,0.95)',
    padding: SPACING.xl,
    borderRadius: BORDER_RADIUS.lg,
    ...SHADOWS.lg,
  },
  cueText: {
    ...TEXT_STYLES.h2,
    color: COLORS.ink,
    textAlign: 'center',
    lineHeight: TYPOGRAPHY.lineHeights.relaxed,
  },
  buttonContainer: {
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.xl,
    backgroundColor: COLORS.white,
    borderTopWidth: 1,
    borderTopColor: COLORS.divider,
  },
  mainButton: {
    backgroundColor: COLORS.primary,
    padding: SPACING.xxxl,
    borderRadius: BORDER_RADIUS.lg,
    alignItems: 'center',
    minHeight: 120,
    justifyContent: 'center',
  },
  thinkingButton: {
    backgroundColor: COLORS.primaryLighter,
  },
  cueButton: {
    backgroundColor: COLORS.primaryLightest,
    opacity: 0.7,
  },
  buttonText: {
    ...TEXT_STYLES.h1,
    fontWeight: TYPOGRAPHY.weights.semibold,
    color: COLORS.white,
  },
});
