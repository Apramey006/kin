import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, AppState } from 'react-native';
import { Mic, Square, RotateCcw, Check, Play, Pause } from 'lucide-react-native';
import { useAudioRecorderAdapter, useAudioPlayerAdapter, type RecordingResult } from '../adapters/audio';
import { Button, Notice, Spinner } from './ui';
import { COLORS, SPACING, BORDER_RADIUS } from '../theme/colors';

const BAR_HEIGHTS = [10, 22, 31, 18, 29, 35, 17, 25, 14, 28, 20, 8];

// Mirrors the web Recorder: big red record button, timer, then a
// listen-back preview with Record again / Save.
export function Recorder({
  onRecorded,
  maxSeconds = 60,
  label = 'Record a memory',
  disabled = false,
}: {
  onRecorded: (result: RecordingResult) => void | boolean | Promise<void | boolean>;
  maxSeconds?: number;
  label?: string;
  disabled?: boolean;
}) {
  const {
    recorderState,
    startRecording,
    stopRecording,
    cancelRecording,
    error: recorderError,
    setError: setRecorderError,
  } = useAudioRecorderAdapter();
  const { isPlaying, playUri, stopAudio } = useAudioPlayerAdapter();

  const [starting, setStarting] = useState(false);
  const [draft, setDraft] = useState<RecordingResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pulse = useRef(new Animated.Value(0)).current;
  const mounted = useRef(true);
  const draftRef = useRef<RecordingResult | null>(null);
  draftRef.current = draft;

  const recording = recorderState.isRecording;
  const seconds = Math.min(maxSeconds, Math.floor((recorderState.durationMillis ?? 0) / 1000));

  // Stop + discard if the app is backgrounded mid-recording.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active' && recorderState.isRecording) {
        cancelRecording();
      }
    });
    return () => sub.remove();
  }, [recorderState.isRecording, cancelRecording]);

  // Auto-stop at maxSeconds.
  useEffect(() => {
    if (recording && seconds >= maxSeconds) void stop();
  }, [recording, seconds, maxSeconds]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      stopAudio();
      if (recorderState.isRecording) void cancelRecording();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Animate the record bars while recording.
  useEffect(() => {
    if (!recording) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 350, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 350, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [recording, pulse]);

  const start = async () => {
    setError(null);
    setRecorderError(null);
    setStarting(true);
    setDraft(null);
    stopAudio();
    try {
      await startRecording();
    } finally {
      if (mounted.current) setStarting(false);
    }
  };

  const stop = async () => {
    const result = await stopRecording();
    if (mounted.current && result && result.size > 0) setDraft(result);
  };

  const save = async () => {
    const current = draftRef.current;
    if (!current) return;
    setSaving(true);
    setError(null);
    try {
      const saved = await onRecorded(current);
      if (saved !== false) setDraft(null);
    } catch (e) {
      if (mounted.current)
        setError(e instanceof Error ? e.message : 'Your recording couldn’t be saved. Try again.');
    } finally {
      if (mounted.current) setSaving(false);
    }
  };

  const shown = error ?? recorderError;

  return (
    <View>
      <View style={styles.surface}>
        {draft ? (
          <>
            <View style={styles.readyPill}>
              <Check size={14} color={COLORS.accent} />
              <Text style={styles.readyPillText}>Ready to listen</Text>
            </View>
            <Text style={styles.draftTitle}>Your recording</Text>
            <Text style={styles.draftSub}>Listen back before sharing it with your family.</Text>
            <TouchableOpacity
              style={styles.playRow}
              onPress={() => (isPlaying ? stopAudio() : playUri(draft.uri))}
              accessibilityRole="button"
              accessibilityLabel={isPlaying ? 'Pause preview' : 'Play your recording'}
            >
              {isPlaying ? (
                <Pause size={18} color={COLORS.accent} />
              ) : (
                <Play size={18} color={COLORS.accent} />
              )}
              <Text style={styles.playText}>
                {isPlaying ? 'Playing…' : `${formatTime(draft.duration)} — tap to listen`}
              </Text>
            </TouchableOpacity>
            <View style={styles.draftActions}>
              <Button
                variant="secondary"
                onPress={start}
                disabled={saving || disabled || starting}
                icon={<RotateCcw size={17} color={COLORS.ink} />}
              >
                Record again
              </Button>
              <Button
                onPress={save}
                disabled={saving || disabled}
                icon={
                  saving || disabled ? (
                    <Spinner />
                  ) : (
                    <Check size={17} color="#fff" />
                  )
                }
              >
                {saving || disabled ? 'Saving…' : 'Save memory'}
              </Button>
            </View>
          </>
        ) : (
          <>
            <Text style={styles.statusText}>{recording ? 'Recording' : 'Ready when you are.'}</Text>
            <View style={styles.bars} accessibilityElementsHidden importantForAccessibility="no">
              {BAR_HEIGHTS.map((h, i) => (
                <Animated.View
                  key={i}
                  style={[
                    styles.bar,
                    {
                      height: h,
                      opacity: recording
                        ? pulse.interpolate({
                            inputRange: [0, 1],
                            outputRange: [0.35, 1],
                          })
                        : 0.25,
                    },
                  ]}
                />
              ))}
            </View>
            <Text
              style={styles.time}
              accessibilityLabel={`${seconds} seconds recorded`}
              accessibilityLiveRegion="polite"
            >
              {formatTime(seconds)}
            </Text>
            <TouchableOpacity
              style={[styles.recordButton, recording && styles.recordButtonActive]}
              disabled={disabled || starting}
              onPress={recording ? stop : start}
              accessibilityRole="button"
              accessibilityLabel={recording ? 'Stop recording' : label}
            >
              {starting ? (
                <Spinner />
              ) : recording ? (
                <Square size={26} color="#fff" fill="#fff" />
              ) : (
                <Mic size={26} color="#fff" fill="#fff" />
              )}
            </TouchableOpacity>
            <Text style={styles.actionLabel}>
              {starting ? 'Opening microphone…' : recording ? 'Tap to finish' : label}
            </Text>
            <Text style={styles.hint}>
              {recording
                ? `Up to ${maxSeconds} seconds. You can listen back before saving.`
                : `Record up to ${maxSeconds} seconds. Listen before you save.`}
            </Text>
          </>
        )}
      </View>
      {shown ? <Notice kind="error">{shown}</Notice> : null}
    </View>
  );
}

function formatTime(totalSeconds: number) {
  const s = Math.max(0, Math.round(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  surface: {
    backgroundColor: '#F0F0F3',
    borderRadius: 14,
    paddingVertical: 24,
    paddingHorizontal: 20,
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  statusText: {
    fontSize: 13,
    color: COLORS.muted,
  },
  bars: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 36,
    marginTop: 16,
  },
  bar: {
    width: 3,
    borderRadius: 3,
    backgroundColor: COLORS.danger,
  },
  time: {
    fontSize: 34,
    letterSpacing: -1,
    color: COLORS.ink,
    fontVariant: ['tabular-nums'],
    marginTop: 6,
  },
  recordButton: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: COLORS.recordRed,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
    borderWidth: 4,
    borderColor: '#fff',
  },
  recordButtonActive: {
    borderRadius: 24,
  },
  actionLabel: {
    fontWeight: '600',
    fontSize: 15,
    color: COLORS.ink,
    marginTop: 14,
  },
  hint: {
    fontSize: 13,
    color: COLORS.muted,
    marginTop: 6,
    textAlign: 'center',
  },
  readyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.accentSoft,
    borderRadius: 20,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  readyPillText: {
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.accent,
  },
  draftTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: COLORS.ink,
    marginTop: 16,
  },
  draftSub: {
    fontSize: 13,
    color: COLORS.muted,
    marginTop: 6,
    textAlign: 'center',
  },
  playRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginTop: 16,
    minHeight: 48,
    alignSelf: 'stretch',
    justifyContent: 'center',
  },
  playText: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.accent,
  },
  draftActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 18,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
});
