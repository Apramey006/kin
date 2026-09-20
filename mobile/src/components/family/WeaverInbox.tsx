import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useAudioRecorderAdapter } from '../../adapters/audio';
import type { WeaverQuestionRow } from '../../types';
import { COLORS, SPACING, BORDER_RADIUS, SHADOWS } from '../../theme/colors';
import { TEXT_STYLES, TYPOGRAPHY } from '../../theme/typography';

interface WeaverInboxProps {
  questions: WeaverQuestionRow[];
  onAnswer: (questionId: string, result: any) => void;
  busy: boolean;
}

export function WeaverInbox({ questions, onAnswer, busy }: WeaverInboxProps) {
  const [selectedQuestion, setSelectedQuestion] = useState<WeaverQuestionRow | null>(null);
  const [isRecordingAnswer, setIsRecordingAnswer] = useState(false);
  
  const {
    audioRecorder,
    recorderState,
    hasPermission,
    error: recorderError,
    startRecording,
    stopRecording,
    cancelRecording,
  } = useAudioRecorderAdapter();

  const [processing, setProcessing] = useState(false);

  const handleStartAnswer = async () => {
    if (!hasPermission) {
      alert('Microphone permission is required to record answers');
      return;
    }

    const success = await startRecording();
    if (success) {
      setIsRecordingAnswer(true);
    }
  };

  const handleStopAnswer = async () => {
    setProcessing(true);
    const result = await stopRecording();
    setIsRecordingAnswer(false);
    setProcessing(false);

    if (result && selectedQuestion) {
      // In production, this would upload the audio and get a transcript
      // For now, we'll simulate the answer
      onAnswer(selectedQuestion.id, {
        transcript: 'This is a sample answer transcript.',
        uri: result.uri,
      });
      setSelectedQuestion(null);
    }
  };

  const handleCancelAnswer = async () => {
    await cancelRecording();
    setIsRecordingAnswer(false);
  };

  if (questions.length === 0) {
    return null;
  }

  if (selectedQuestion) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Answer a question</Text>
        
        <View style={styles.questionContainer}>
          <Text style={styles.questionText}>{selectedQuestion.question_text}</Text>
          
          {selectedQuestion.evidence.length > 0 && (
            <View style={styles.evidenceContainer}>
              <Text style={styles.evidenceTitle}>Related memories:</Text>
              {selectedQuestion.evidence.map((evidence, index) => (
                <Text key={index} style={styles.evidenceText}>
                  • {evidence.summary}
                </Text>
              ))}
            </View>
          )}
        </View>

        {recorderError && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{recorderError}</Text>
          </View>
        )}

        {recorderState.isRecording && (
          <View style={styles.recordingInfo}>
            <View style={styles.recordingIndicator} />
            <Text style={styles.recordingTime}>
              {Math.floor(recorderState.durationMillis / 1000)}s
            </Text>
          </View>
        )}

        <View style={styles.buttonContainer}>
          {!isRecordingAnswer && !processing && (
            <TouchableOpacity
              style={styles.recordButton}
              onPress={handleStartAnswer}
              disabled={busy}
            >
              <Text style={styles.recordButtonText}>Record Answer</Text>
            </TouchableOpacity>
          )}

          {isRecordingAnswer && (
            <TouchableOpacity
              style={[styles.stopButton, processing && styles.disabledButton]}
              onPress={handleStopAnswer}
              disabled={processing}
            >
              <Text style={styles.stopButtonText}>
                {processing ? 'Processing...' : 'Stop Recording'}
              </Text>
            </TouchableOpacity>
          )}

          {isRecordingAnswer && !processing && (
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={handleCancelAnswer}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          )}

          {!isRecordingAnswer && !processing && (
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => setSelectedQuestion(null)}
            >
              <Text style={styles.backButtonText}>Back to Questions</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Questions from Kin</Text>
      <Text style={styles.subtitle}>
        Kin has {questions.length} question{questions.length !== 1 ? 's' : ''} for you
      </Text>
      
      <ScrollView style={styles.questionsList}>
        {questions.map((question) => (
          <TouchableOpacity
            key={question.id}
            style={styles.questionItem}
            onPress={() => setSelectedQuestion(question)}
            disabled={busy}
          >
            <Text style={styles.questionPreview}>{question.question_text}</Text>
            <View style={styles.questionMeta}>
              <Text style={styles.gapType}>{question.gap_type}</Text>
              <Text style={styles.questionDate}>
                {new Date(question.created_at).toLocaleDateString()}
              </Text>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
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
    marginBottom: SPACING.xs,
  },
  subtitle: {
    ...TEXT_STYLES.body,
    color: COLORS.inkLight,
    marginBottom: SPACING.lg,
  },
  questionsList: {
    maxHeight: 200,
  },
  questionItem: {
    padding: SPACING.lg,
    backgroundColor: COLORS.inkLightest,
    borderRadius: BORDER_RADIUS.md,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.divider,
  },
  questionPreview: {
    ...TEXT_STYLES.body,
    color: COLORS.ink,
    marginBottom: SPACING.sm,
  },
  questionMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  gapType: {
    ...TEXT_STYLES.caption,
    color: COLORS.primary,
    fontWeight: TYPOGRAPHY.weights.medium,
  },
  questionDate: {
    ...TEXT_STYLES.caption,
    color: COLORS.inkLighter,
  },
  questionContainer: {
    padding: SPACING.lg,
    backgroundColor: COLORS.primaryLightest,
    borderRadius: BORDER_RADIUS.md,
    marginBottom: SPACING.lg,
  },
  questionText: {
    ...TEXT_STYLES.body,
    color: COLORS.ink,
    marginBottom: SPACING.md,
  },
  evidenceContainer: {
    marginTop: SPACING.sm,
  },
  evidenceTitle: {
    ...TEXT_STYLES.caption,
    fontWeight: TYPOGRAPHY.weights.semibold,
    color: COLORS.inkLight,
    marginBottom: SPACING.xs,
  },
  evidenceText: {
    ...TEXT_STYLES.caption,
    color: COLORS.inkLight,
    marginBottom: SPACING.xs,
  },
  errorContainer: {
    padding: SPACING.md,
    backgroundColor: '#FFEBEE',
    borderRadius: BORDER_RADIUS.md,
    marginBottom: SPACING.lg,
  },
  errorText: {
    ...TEXT_STYLES.body,
    color: '#D32F2F',
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
  backButton: {
    flex: 1,
    backgroundColor: COLORS.inkLighter,
    padding: SPACING.lg,
    borderRadius: BORDER_RADIUS.md,
    alignItems: 'center',
  },
  backButtonText: {
    ...TEXT_STYLES.body,
    fontWeight: TYPOGRAPHY.weights.semibold,
    color: COLORS.white,
  },
});
