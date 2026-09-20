import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Images, ScanFace, ArrowRight, LockKeyhole } from 'lucide-react-native';
import { Brand } from '../src/components/Brand';
import { COLORS, SPACING, BORDER_RADIUS, SHADOWS } from '../src/theme/colors';

// Landing-style mode picker matching the web home page.
export default function IndexScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 24 }]}>
      <View style={styles.nav}>
        <Brand />
      </View>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.productLabel}>KIN · FAMILY MEMORY</Text>
        <Text style={styles.hero} maxFontSizeMultiplier={1.3}>
          A little help.{'\n'}A familiar world.
        </Text>
        <Text style={styles.heroSub} maxFontSizeMultiplier={1.5}>
          Photos and stories from the people you love.{'\n'}A gentle reminder when you need one.
        </Text>

        <TouchableOpacity
          style={styles.choiceCard}
          onPress={() => router.push('/family')}
          accessibilityRole="button"
          accessibilityLabel="Memories — family mode"
          accessibilityHint="Add photos, record stories, and answer Kin's questions"
        >
          <View style={styles.choiceIcon}>
            <Images size={24} color={COLORS.accent} strokeWidth={1.6} />
          </View>
          <View style={styles.choiceText}>
            <Text style={styles.choiceTitle}>I’m family</Text>
            <Text style={styles.choiceSub}>Add photos, record stories, answer Kin’s questions.</Text>
          </View>
          <ArrowRight size={18} color={COLORS.muted} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.choiceCard}
          onPress={() => router.push('/companion')}
          accessibilityRole="button"
          accessibilityLabel="Recognize — companion mode"
          accessibilityHint="Point the camera and tap to hear who someone is"
        >
          <View style={styles.choiceIcon}>
            <ScanFace size={24} color={COLORS.accent} strokeWidth={1.6} />
          </View>
          <View style={styles.choiceText}>
            <Text style={styles.choiceTitle}>Kin for your loved one</Text>
            <Text style={styles.choiceSub}>One button. Point, tap, listen.</Text>
          </View>
          <ArrowRight size={18} color={COLORS.muted} />
        </TouchableOpacity>

        <View style={styles.footer}>
          <LockKeyhole size={14} color={COLORS.muted} />
          <Text style={styles.footerText}>
            Your family’s memories stay in your family.{'\n'}
            <Text style={styles.footerMuted}>Kin stays quiet when there isn’t a clear match.</Text>
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.surface,
  },
  nav: {
    paddingHorizontal: 24,
  },
  scroll: {
    paddingHorizontal: 24,
    paddingTop: 36,
    alignItems: 'stretch',
  },
  productLabel: {
    fontSize: 11,
    letterSpacing: 2.6,
    fontWeight: '600',
    color: COLORS.muted,
    marginBottom: 20,
  },
  hero: {
    fontSize: 44,
    fontWeight: '600',
    lineHeight: 45,
    letterSpacing: -2.4,
    color: COLORS.ink,
  },
  heroSub: {
    fontSize: 17,
    lineHeight: 26,
    color: COLORS.muted,
    marginTop: 20,
    marginBottom: 36,
    letterSpacing: -0.2,
  },
  choiceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    backgroundColor: COLORS.paper,
    borderRadius: BORDER_RADIUS.lg,
    padding: 20,
    marginBottom: 14,
    minHeight: 96,
  },
  choiceIcon: {
    width: 48,
    height: 48,
    borderRadius: 13,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.sm,
  },
  choiceText: {
    flex: 1,
    minWidth: 0,
  },
  choiceTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.ink,
  },
  choiceSub: {
    fontSize: 13,
    color: COLORS.muted,
    marginTop: 4,
    lineHeight: 18,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 44,
    paddingHorizontal: 4,
  },
  footerText: {
    fontSize: 13,
    color: COLORS.ink,
    lineHeight: 20,
  },
  footerMuted: {
    color: COLORS.muted,
  },
});
