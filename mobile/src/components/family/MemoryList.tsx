import { View, Text, StyleSheet, ScrollView } from 'react-native';
import type { MemoryRow } from '../../types';
import { COLORS, SPACING, BORDER_RADIUS, SHADOWS } from '../../theme/colors';
import { TEXT_STYLES, TYPOGRAPHY } from '../../theme/typography';

interface MemoryListProps {
  memories: MemoryRow[];
}

export function MemoryList({ memories }: MemoryListProps) {
  if (memories.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>My memories</Text>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>
            Nothing yet. Your stories and photos will live here.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>My memories</Text>
      <ScrollView style={styles.memoriesList}>
        {memories.map((memory) => (
          <View key={memory.id} style={styles.memoryItem}>
            <View style={styles.memoryHeader}>
              <Text style={styles.memoryKind}>{memory.kind.toUpperCase()}</Text>
              <Text style={styles.memoryDate}>
                {new Date(memory.created_at).toLocaleDateString()}
              </Text>
            </View>
            <Text style={styles.memorySummary}>{memory.summary}</Text>
            {memory.transcript && (
              <Text style={styles.memoryTranscript}>{memory.transcript}</Text>
            )}
          </View>
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
    marginBottom: SPACING.lg,
  },
  emptyContainer: {
    padding: SPACING.xl,
    alignItems: 'center',
  },
  emptyText: {
    ...TEXT_STYLES.body,
    color: COLORS.inkLight,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  memoriesList: {
    maxHeight: 300,
  },
  memoryItem: {
    padding: SPACING.lg,
    backgroundColor: COLORS.inkLightest,
    borderRadius: BORDER_RADIUS.md,
    marginBottom: SPACING.md,
  },
  memoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  memoryKind: {
    ...TEXT_STYLES.caption,
    fontWeight: TYPOGRAPHY.weights.semibold,
    color: COLORS.inkLight,
    letterSpacing: TYPOGRAPHY.letterSpacing.wide,
    textTransform: 'uppercase',
  },
  memoryDate: {
    ...TEXT_STYLES.caption,
    color: COLORS.inkLighter,
  },
  memorySummary: {
    ...TEXT_STYLES.body,
    color: COLORS.ink,
    marginBottom: SPACING.xs,
  },
  memoryTranscript: {
    ...TEXT_STYLES.body,
    color: COLORS.inkLight,
    fontStyle: 'italic',
  },
});
