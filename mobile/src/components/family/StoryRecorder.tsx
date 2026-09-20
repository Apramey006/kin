import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useAudioRecorderAdapter } from '../../adapters/audio';
import { createError, handleAppError, ErrorCodes } from '../../utils/errorHandling';
import { COLORS, SPACING, BORDER_RADIUS, SHADOWS } from '../../theme/colors';
import { TEXT_STYLES, TYPOGRAPHY } from '../../theme/typography';

interface StoryRecorderProps {
  onSubmit: (result: { transcript: string; entities: any[] }) => void;
  busy: boolean;
}

export function StoryRecorder({ onSubmit, busy }: StoryRecorderProps) {
  const {
    audioRecorder,
    recorderState,
    hasPermission,
    error: recorderError,
    startRecording,
    stopRecording,
    cancelRecording,
  } = useAudioRecorderAdapter();

  const [isRecording, setIsRecording] = useState(false);
  const [processing, setProcessing] = useState(false);

  const handleStartRecording = async () => {
    if (!hasPermission) {
      const error = createError(
        'MICROPHONE_PERMISSION_DENIED',
        'Microphone permission not granted',
        'Microphone permission is required to record stories'
      );
      const userMessage = handleAppError(error);
      Alert.alert('Permission Required', userMessage);
      return;
    }

    try {
      const success = await startRecording();
      if (success) {
        setIsRecording(true);
      } else {
        throw createError('RECORDING_ERROR', 'Failed to start recording');
      }
    } catch (error) {
      const userMessage = handleAppError(error);
      Alert.alert('Recording Error', userMessage);
    }
  };

  const handleStopRecording = async () => {
    setProcessing(true);
    try {
      const result = await stopRecording();
      setIsRecording(false);
      setProcessing(false);

      if (result) {
        // In production, this would transcribe the audio
        // For now, we'll simulate a transcript
        const mockTranscript = 'This is a sample story transcript. In production, this would be the actual transcribed text from your recording.';
        
        onSubmit({
          transcript: mockTranscript,
          entities: [],
        });
      } else {
        throw createError('RECORDING_ERROR', 'Recording failed - no file created');
      }
    } catch (error) {
      setProcessing(false);
      setIsRecording(false);
      const userMessage = handleAppError(error);
      Alert.alert('Recording Error', userMessage);
    }
  };

  const handleCancelRecording = async () => {
    try {
      await cancelRecording();
      setIsRecording(false);
    } catch (error) {
      const userMessage = handleAppError(error);
      Alert.alert('Error', userMessage);
    }
  };

  if (!hasPermission) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Record a story</Text>
        <View style={styles.permissionContainer}>
          <Text style={styles.permissionText}>
            Microphone permission is required to record stories
          </Text>
        </View>
      </View>
    );
  }

  if (recorderError) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Record a story</Text>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{recorderError}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Record a story</Text>
      
      {recorderState.isRecording && (
        <View style={styles.recordingInfo}>
          <View style={styles.recordingIndicator} />
          <Text style={styles.recordingTime}>
            {Math.floor(recorderState.durationMillis / 1000)}s
          </Text>
        </View>
      )}

      <View style={styles.buttonContainer}>
        {!isRecording && !processing && (
          <TouchableOpacity
            style={styles.recordButton}
            onPress={handleStartRecording}
            disabled={busy}
            accessible={true}
            accessibilityLabel="Start recording story"
            accessibilityRole="button"
            accessibilityHint="Begins recording your voice for a family story"
            accessibilityState={{ disabled: busy }}
          >
            <Text style={styles.recordButtonText}>Record Story</Text>
          </TouchableOpacity>
        )}

        {isRecording && (
          <TouchableOpacity
            style={[styles.stopButton, processing && styles.disabledButton]}
            onPress={handleStopRecording}
            disabled={processing}
            accessible={true}
            accessibilityLabel="Stop recording"
            accessibilityRole="button"
            accessibilityHint="Stops recording and processes your story"
            accessibilityState={{ disabled: processing }}
          >
            <Text style={styles.stopButtonText}>
              {processing ? 'Processing...' : 'Stop Recording'}
            </Text>
          </TouchableOpacity>
        )}

        {isRecording && !processing && (
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={handleCancelRecording}
            accessible={true}
            accessibilityLabel="Cancel recording"
            accessibilityRole="button"
            accessibilityHint="Cancels the current recording without saving"
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
        )}
      </View>

      <Text style={styles.hint}>
        Record a short story about a family memory, person, or tradition
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.white,
    padding: SPACING.xl,
    marginBottom: SPACING.lg,
    borderRadius: BORDER_RADIUS.lg,
    ...SHADOWS.md,
  },
  title: {
    ...TEXT_STYLES.h3,
    color: COLORS.ink,
    marginBottom: SPACING.lg,
  },
  permissionContainer: {
    padding: SPACING.lg,
    backgroundColor: '#FFF3E0',
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: '#FFE0B2',
  },
  permissionText: {
    ...TEXT_STYLES.body,
    color: '#E65100',
    textAlign: 'center',
  },
  errorContainer: {
    padding: SPACING.lg,
    backgroundColor: '#FFEBEE',
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: '#FFCDD2',
  },
  errorText: {
    ...TEXT_STYLES.body,
    color: '#D32F2F',
    textAlign: 'center',
  },
  recordingInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.lg,
    padding: SPACING.md,
    backgroundColor: '#FFEBEE',
    borderRadius: BORDER_RADIUS.md,
  },
  recordingIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#F44336',
    marginRight: SPACING.md,
  },
  recordingTime: {
    ...TEXT_STYLES.body,
    fontWeight: TYPOGRAPHY.weights.semibold,
    color: '#D32F2F',
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginBottom: SPACING.md,
  },
  recordButton: {
    flex: 1,
    backgroundColor: COLORS.primary,
    padding: SPACING.lg,
    borderRadius: BORDER_RADIUS.md,
    alignItems: 'center',
  },
  recordButtonText: {
    ...TEXT_STYLES.body,
    fontWeight: TYPOGRAPHY.weights.semibold,
    color: COLORS.white,
  },
  stopButton: {
    flex: 1,
    backgroundColor: '#F44336',
    padding: SPACING.lg,
    borderRadius: BORDER_RADIUS.md,
    alignItems: 'center',
  },
  disabledButton: {
    backgroundColor: COLORS.inkLighter,
  },
  stopButtonText: {
    ...TEXT_STYLES.body,
    fontWeight: TYPOGRAPHY.weights.semibold,
    color: COLORS.white,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: COLORS.inkLighter,
    padding: SPACING.lg,
    borderRadius: BORDER_RADIUS.md,
    alignItems: 'center',
  },
  cancelButtonText: {
    ...TEXT_STYLES.body,
    fontWeight: TYPOGRAPHY.weights.semibold,
    color: COLORS.white,
  },
  hint: {
    ...TEXT_STYLES.caption,
    color: COLORS.inkLight,
    textAlign: 'center',
    fontStyle: 'italic',
  },
});
