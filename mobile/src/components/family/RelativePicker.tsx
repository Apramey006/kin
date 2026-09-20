import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import type { Relative } from '../../types';
import { useScaledFontSize, ensureTouchTargetSize } from '../../utils/accessibilityComponents';
import { COLORS, SPACING, BORDER_RADIUS, SHADOWS } from '../../theme/colors';
import { TEXT_STYLES } from '../../theme/typography';

interface RelativePickerProps {
  relatives: Relative[];
  onSelect: (relative: Relative) => void;
}

export function RelativePicker({ relatives, onSelect }: RelativePickerProps) {
  const scaledNameSize = useScaledFontSize(24);
  const scaledRelationSize = useScaledFontSize(16);
  const scaledEmptyTextSize = useScaledFontSize(16);
  const minButtonHeight = ensureTouchTargetSize(100);

  if (relatives.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={[styles.emptyText, { fontSize: scaledEmptyTextSize }]}>
          No relatives yet. Please contact your family administrator to set up the family.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {relatives.map((relative) => (
        <TouchableOpacity
          key={relative.id}
          style={[styles.relativeButton, { borderColor: relative.color, minHeight: minButtonHeight }]}
          onPress={() => onSelect(relative)}
          accessible={true}
          accessibilityLabel={`${relative.name}, ${relative.relation_to_wearer}`}
          accessibilityRole="button"
          accessibilityHint="Tap to select this family member"
        >
          <Text style={[styles.name, { fontSize: scaledNameSize }]}>{relative.name}</Text>
          <Text style={[styles.relation, { fontSize: scaledRelationSize }]}>
            {relative.relation_to_wearer}
          </Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: SPACING.xl,
  },
  contentContainer: {
    paddingBottom: SPACING.xl,
  },
  emptyContainer: {
    padding: SPACING.xl,
    alignItems: 'center',
  },
  emptyText: {
    ...TEXT_STYLES.body,
    color: COLORS.inkLight,
    textAlign: 'center',
  },
  relativeButton: {
    padding: SPACING.xl,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 2,
    backgroundColor: COLORS.white,
    marginBottom: SPACING.lg,
    justifyContent: 'center',
    ...SHADOWS.md,
  },
  name: {
    ...TEXT_STYLES.h2,
    color: COLORS.ink,
    marginBottom: SPACING.xs,
  },
  relation: {
    ...TEXT_STYLES.body,
    color: COLORS.inkLight,
  },
});
