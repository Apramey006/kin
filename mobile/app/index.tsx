import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useScaledFontSize, ensureTouchTargetSize } from '../src/utils/accessibilityComponents';
import { COLORS, SPACING, BORDER_RADIUS, SHADOWS } from '../src/theme/colors';

export default function IndexScreen() {
  const router = useRouter();
  const scaledTitleSize = useScaledFontSize(24);
  const scaledSubtitleSize = useScaledFontSize(18);
  const scaledButtonTextSize = useScaledFontSize(22);
  const scaledButtonSubtextSize = useScaledFontSize(16);
  const minButtonHeight = ensureTouchTargetSize(120);

  return (
    <View style={styles.container}>
      <Text style={[styles.brand, { fontSize: scaledTitleSize }]}>Kin</Text>
      <Text style={[styles.title, { fontSize: scaledTitleSize * 1.5 }]}>
        The family remembers together.
      </Text>
      <Text style={[styles.subtitle, { fontSize: scaledSubtitleSize }]}>
        A shared memory for your loved one. Every cue comes from something a relative actually said.
      </Text>
      
      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={[styles.button, { minHeight: minButtonHeight }]}
          onPress={() => router.push('/family')}
          accessible={true}
          accessibilityLabel="Family mode - add photos and stories"
          accessibilityHint="Opens family mode where you can add photos and record stories"
          accessibilityRole="button"
        >
          <View style={styles.buttonContent}>
            <View style={[styles.icon, styles.familyIcon]} />
            <View style={styles.textContainer}>
              <Text style={[styles.buttonText, { fontSize: scaledButtonTextSize }]}>I'm family</Text>
              <Text style={[styles.buttonSubtext, { fontSize: scaledButtonSubtextSize }]}>
                Add photos, record stories, answer Kin's questions.
              </Text>
            </View>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, { minHeight: minButtonHeight }]}
          onPress={() => router.push('/companion')}
          accessible={true}
          accessibilityLabel="Companion mode - who is this"
          accessibilityHint="Opens companion mode for identifying people and getting memory cues"
          accessibilityRole="button"
        >
          <View style={styles.buttonContent}>
            <View style={[styles.icon, styles.companionIcon]} />
            <View style={styles.textContainer}>
              <Text style={[styles.buttonText, { fontSize: scaledButtonTextSize }]}>Kin for your loved one</Text>
              <Text style={[styles.buttonSubtext, { fontSize: scaledButtonSubtextSize }]}>
                One button. Point, tap, listen.
              </Text>
            </View>
          </View>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.paper,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.xl,
  },
  brand: {
    color: COLORS.primary,
    fontWeight: '600',
    letterSpacing: 3,
    textTransform: 'uppercase',
    marginBottom: SPACING.md,
  },
  title: {
    color: COLORS.ink,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: SPACING.sm,
  },
  subtitle: {
    color: COLORS.inkLight,
    textAlign: 'center',
    marginBottom: SPACING.xxxl,
    maxWidth: 400,
  },
  buttonContainer: {
    width: '100%',
    maxWidth: 600,
    gap: SPACING.lg,
  },
  button: {
    padding: SPACING.xl,
    borderRadius: BORDER_RADIUS.lg,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.divider,
    ...SHADOWS.sm,
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.lg,
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 8,
  },
  familyIcon: {
    backgroundColor: COLORS.primary,
  },
  companionIcon: {
    backgroundColor: COLORS.primary,
  },
  textContainer: {
    flex: 1,
  },
  buttonText: {
    fontWeight: '600',
    color: COLORS.ink,
    marginBottom: 4,
  },
  buttonSubtext: {
    color: COLORS.inkLight,
  },
});
