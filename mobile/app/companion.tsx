import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, AppState } from 'react-native';
import {
  Camera,
  ScanFace,
  Headphones,
  Volume2,
  RotateCcw,
} from 'lucide-react-native';
import { CameraView } from 'expo-camera';
import { AppShell } from '../src/components/AppShell';
import { Button, Notice } from '../src/components/ui';
import { useCameraAdapter } from '../src/adapters/camera';
import { useTextToSpeech, useAudioPlayerAdapter } from '../src/adapters/audio';
import { apiClient } from '../src/api/client';
import { fixtureCues, fixtureWearer } from '../src/fixtures/data';
import { COLORS } from '../src/theme/colors';

type Phase = 'idle' | 'thinking' | 'cue' | 'quiet';

const API_CONFIGURED =
  !!process.env.EXPO_PUBLIC_API_URL &&
  !process.env.EXPO_PUBLIC_API_URL.includes('your-backend-url');

// Mirrors the web /wearer Recognize screen: one camera, one action, one cue.
// With EXPO_PUBLIC_API_URL set it calls the real /api/recall pipeline;
// otherwise it runs a fixture recall that speaks a rotating family cue when a
// face is visible in the frame and stays quiet when none is.
export default function CompanionScreen() {
  const [enabled, setEnabled] = useState(false);
  const [starting, setStarting] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [cue, setCue] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const {
    cameraRef,
    isReady,
    requestCameraPermission,
    captureAndCheckFace,
  } = useCameraAdapter();

  const { speak, stop: stopSpeaking } = useTextToSpeech();
  const { playBase64Audio, stopAudio } = useAudioPlayerAdapter();
  const cueIndex = useRef(0);
  const thinking = phase === 'thinking';
  const pending = useRef(false);

  // Reset to a calm idle state when the app returns from background.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        stopSpeaking();
        stopAudio();
        pending.current = false;
        setPhase('idle');
        setCue(null);
      }
    });
    return () => {
      sub.remove();
      stopSpeaking();
      stopAudio();
    };
  }, [stopSpeaking, stopAudio]);

  const start = async () => {
    setError(null);
    setStarting(true);
    try {
      const granted = await requestCameraPermission();
      if (granted) {
        setEnabled(true);
      } else {
        setError(
          'Camera access is turned off. Allow it in Settings, then try again.',
        );
      }
    } finally {
      setStarting(false);
    }
  };

  const showCue = async (text: string, audio?: string | null) => {
    setCue(text);
    setPhase('cue');
    // Prefer the voiced audio cue from the backend; fall back to native speech.
    if (audio) {
      const ok = await playBase64Audio(audio);
      if (ok) return;
    }
    speak(text);
  };

  const recognize = async (simulateQuiet = false) => {
    if (pending.current || thinking || !isReady) return;
    pending.current = true;
    setPhase('thinking');
    setCue(null);
    setError(null);
    try {
      if (API_CONFIGURED) {
        const { frame } = await captureAndCheckFace();
        if (!frame) {
          setError('The camera image couldn’t be captured. Try again.');
          setPhase('idle');
          return;
        }
        const res = await apiClient.recall(
          { uri: frame.uri, name: 'snapshot.jpg', type: 'image/jpeg' },
          [],
        );
        if (res.decision === 'speak' && res.cueText) {
          await showCue(res.cueText, res.audio);
        } else if (res.reasonCode === 'provider_failure') {
          setError('Recognition is temporarily unavailable. Please try again.');
          setPhase('idle');
        } else {
          setPhase('quiet');
        }
        return;
      }

      // Fixture mode: the on-device detector decides. 'unknown' (detector
      // unavailable) defaults to a cue so the demo still flows.
      const { face } = await captureAndCheckFace();
      await new Promise((r) => setTimeout(r, 1200));
      if (simulateQuiet || face === 'none') {
        setPhase('quiet');
      } else {
        const next = fixtureCues[cueIndex.current % fixtureCues.length];
        cueIndex.current += 1;
        await showCue(next.text);
      }
    } catch (e) {
      setError('Kin couldn’t connect. Please try again.');
      setPhase('idle');
    } finally {
      pending.current = false;
    }
  };

  return (
    <AppShell familyName={`${fixtureWearer.name}’s family`} me={fixtureWearer.name}>
      <View style={styles.content}>
        <Text style={styles.recognitionFor}>For {fixtureWearer.name}</Text>

        {!enabled ? (
          <View style={styles.intro}>
            <View style={styles.orb} accessibilityElementsHidden importantForAccessibility="no">
              <ScanFace size={48} color="#6A7D97" strokeWidth={1.15} />
            </View>
            <Text style={styles.introTitle} maxFontSizeMultiplier={1.4}>
              A familiar face.{'\n'}A gentle reminder.
            </Text>
            <Text style={styles.introBody} maxFontSizeMultiplier={1.5}>
              Point the camera at someone you know, or their photo. Tap once to
              hear a memory from your family.
            </Text>
            <Button
              size="lg"
              full
              onPress={start}
              disabled={starting}
              icon={<Camera size={19} color="#fff" />}
            >
              {starting ? 'Opening your camera…' : 'Open camera'}
            </Button>
            <Text style={styles.introNote}>Kin stays quiet when it isn’t sure.</Text>
          </View>
        ) : (
          <>
            <View style={styles.cameraView}>
              <CameraView
                ref={cameraRef}
                style={StyleSheet.absoluteFill}
                facing="back"
                mode="picture"
              />
              <View style={styles.corners} pointerEvents="none" />
              <View style={styles.labelPill} pointerEvents="none">
                <Text style={styles.labelText}>
                  {thinking
                    ? 'Finding a memory…'
                    : !isReady
                      ? 'Getting ready…'
                      : 'One familiar face at a time'}
                </Text>
              </View>
              {phase === 'cue' && cue && (
                <View
                  style={styles.cueCard}
                  accessibilityLiveRegion="assertive"
                  accessibilityRole="alert"
                >
                  <View style={styles.cueHead}>
                    <Volume2 size={16} color={COLORS.muted} />
                    <Text style={styles.cueFrom}>From your family</Text>
                  </View>
                  <Text style={styles.cueText} maxFontSizeMultiplier={1.5}>
                    {cue}
                  </Text>
                </View>
              )}
            </View>

            <TouchableOpacity
              style={[styles.action, (thinking || !isReady) && styles.actionDisabled]}
              onPress={() => recognize(false)}
              onLongPress={() => recognize(true)}
              delayLongPress={600}
              disabled={thinking || !isReady}
              accessibilityRole="button"
              accessibilityLabel="Who is this?"
              accessibilityHint="Captures a photo and speaks a memory cue if the face is familiar"
            >
              <ScanFace size={24} color="#fff" />
              <Text style={styles.actionText} maxFontSizeMultiplier={1.4}>
                {thinking
                  ? 'One little moment…'
                  : !isReady
                    ? 'Getting ready…'
                    : 'Who is this?'}
              </Text>
            </TouchableOpacity>

            {phase === 'quiet' ? (
              <Text style={styles.quiet} accessibilityLiveRegion="polite">
                No familiar face this time.{'\n'}
                <Text style={styles.quietMuted}>Kin will stay quiet.</Text>
              </Text>
            ) : (
              <View style={styles.helpRow}>
                <Headphones size={15} color={COLORS.muted} />
                <Text style={styles.helpText}>
                  Keep sound on, or connect your headphones.
                </Text>
              </View>
            )}
          </>
        )}

        {error && (
          <View style={styles.errorBlock}>
            <Notice kind="error">{error}</Notice>
            <Button
              variant="outline"
              onPress={start}
              disabled={starting}
              icon={<RotateCcw size={17} color={COLORS.ink} />}
            >
              Try camera again
            </Button>
          </View>
        )}
      </View>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 130,
  },
  recognitionFor: {
    textAlign: 'center',
    fontSize: 13,
    color: COLORS.muted,
    marginBottom: 18,
  },
  intro: {
    alignItems: 'center',
    marginTop: 24,
  },
  orb: {
    width: 96,
    height: 96,
    borderRadius: 28,
    backgroundColor: '#E9EBF0',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 30,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.04,
    shadowRadius: 24,
    elevation: 2,
  },
  introTitle: {
    fontSize: 36,
    fontWeight: '600',
    letterSpacing: -1.4,
    lineHeight: 40,
    textAlign: 'center',
    color: COLORS.ink,
  },
  introBody: {
    fontSize: 16,
    color: COLORS.muted,
    textAlign: 'center',
    lineHeight: 25,
    marginTop: 18,
    marginBottom: 28,
    maxWidth: 400,
  },
  introNote: {
    fontSize: 13,
    color: COLORS.muted,
    marginTop: 18,
  },
  cameraView: {
    aspectRatio: 4 / 5,
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: COLORS.cameraDark,
  },
  corners: {
    position: 'absolute',
    top: '18%',
    bottom: '18%',
    left: '18%',
    right: '18%',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
    borderRadius: 30,
  },
  labelPill: {
    position: 'absolute',
    top: 22,
    alignSelf: 'center',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 24,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  labelText: {
    fontSize: 12,
    color: '#fff',
  },
  cueCard: {
    position: 'absolute',
    bottom: 18,
    left: 18,
    right: 18,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 16,
    padding: 20,
  },
  cueHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginBottom: 8,
  },
  cueFrom: {
    fontSize: 12,
    color: COLORS.muted,
  },
  cueText: {
    fontSize: 20,
    lineHeight: 28,
    letterSpacing: -0.3,
    color: COLORS.ink,
  },
  action: {
    marginTop: 20,
    minHeight: 66,
    borderRadius: 16,
    backgroundColor: COLORS.accent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  actionDisabled: {
    opacity: 0.55,
  },
  actionText: {
    color: '#fff',
    fontSize: 19,
    fontWeight: '600',
    letterSpacing: -0.3,
  },
  quiet: {
    textAlign: 'center',
    color: COLORS.ink,
    fontSize: 18,
    marginTop: 20,
    lineHeight: 26,
  },
  quietMuted: {
    color: COLORS.muted,
    fontSize: 15,
  },
  helpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    marginTop: 20,
  },
  helpText: {
    fontSize: 14,
    color: COLORS.muted,
  },
  errorBlock: {
    marginTop: 20,
    gap: 4,
  },
});
