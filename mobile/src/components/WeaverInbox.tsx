import { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MessageCircle, ArrowRight } from 'lucide-react-native';
import type { Relative, WeaverQuestionRow } from '../types';
import type { RecordingResult } from '../adapters/audio';
import { Sheet, Button, Notice } from './ui';
import { Recorder } from './Recorder';
import { COLORS, SPACING, BORDER_RADIUS } from '../theme/colors';

// Mirrors the web WeaverInbox: a "Question for you" prompt card per open
// question addressed to the current relative; answering opens a recorder sheet.
export function WeaverInbox({
  me,
  relatives,
  questions,
  onAnswered,
}: {
  me: Relative;
  relatives: Relative[];
  questions: WeaverQuestionRow[];
  onAnswered: (questionId: string, result: RecordingResult) => void | Promise<void>;
}) {
  const [selected, setSelected] = useState<WeaverQuestionRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const own = questions.filter(
    (q) => q.target_relative_id === me.id && q.status === 'open',
  );

  const answer = async (result: RecordingResult) => {
    if (!selected) return false;
    setBusy(true);
    setError(null);
    try {
      await onAnswered(selected.id, result);
      setSelected(null);
      setSuccess(true);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Your answer couldn’t be saved.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  return (
    <View>
      {success && <Notice kind="success">Your answer is saved.</Notice>}
      {own.map((q) => (
        <View style={styles.promptCard} key={q.id}>
          <View style={styles.eyebrowRow}>
            <MessageCircle size={15} color={COLORS.accent} />
            <Text style={styles.eyebrow}>Question for you</Text>
          </View>
          <Text style={styles.promptTitle}>Do you remember?</Text>
          <Text style={styles.promptBody}>{q.question_text}</Text>
          <Button onPress={() => setSelected(q)} icon={<ArrowRight size={17} color="#fff" />}>
            Share what you remember
          </Button>
        </View>
      ))}
      <Sheet
        open={!!selected}
        onClose={() => setSelected(null)}
        title="Record an answer"
        busy={busy}
      >
        {selected && (
          <>
            <Text style={styles.sheetIntro}>{selected.question_text}</Text>
            <Recorder onRecorded={answer} disabled={busy} label="Record your answer" />
            {selected.evidence?.length > 0 && (
              <View style={styles.evidence}>
                <Text style={styles.evidenceTitle}>What your family has shared</Text>
                {selected.evidence.map((e) => (
                  <View style={styles.evidenceItem} key={e.memory_id}>
                    <Text style={styles.evidenceText}>
                      <Text style={styles.evidenceName}>
                        {relatives.find((r) => r.id === e.contributor_id)?.name ??
                          'A relative'}
                        :{' '}
                      </Text>
                      {e.summary}
                    </Text>
                  </View>
                ))}
              </View>
            )}
            {error && <Notice kind="error">{error}</Notice>}
          </>
        )}
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  promptCard: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    padding: 22,
    marginBottom: 24,
  },
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.2,
    color: COLORS.accent,
  },
  promptTitle: {
    fontSize: 19,
    fontWeight: '600',
    letterSpacing: -0.3,
    color: COLORS.ink,
    marginTop: 10,
    marginBottom: 8,
  },
  promptBody: {
    fontSize: 14,
    color: COLORS.muted,
    lineHeight: 21,
    marginBottom: 16,
  },
  sheetIntro: {
    fontSize: 15,
    color: COLORS.muted,
    lineHeight: 22,
    marginBottom: 20,
  },
  evidence: {
    marginTop: 4,
    marginBottom: 12,
  },
  evidenceTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.ink,
    marginBottom: 8,
  },
  evidenceItem: {
    borderLeftWidth: 2,
    borderLeftColor: '#C8D6E8',
    paddingLeft: 12,
    paddingVertical: 8,
    marginBottom: 8,
  },
  evidenceText: {
    fontSize: 13,
    color: COLORS.muted,
    lineHeight: 19,
  },
  evidenceName: {
    color: COLORS.ink,
    fontWeight: '600',
  },
});
