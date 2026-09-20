import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { COLORS } from '../theme/colors';
import { TEXT_STYLES } from '../theme/typography';

// Same mark as the web Brand component (components/Brand.tsx).
export function KinMark({ size = 26, color = COLORS.ink }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <Path
        d="M16 27C9 23 4 18 4 12a6 6 0 0 1 12-1 6 6 0 0 1 12 1c0 6-5 11-12 15Z"
        fill={color}
      />
      <Path
        d="M16 11v13M8 15l8 9 8-9"
        stroke="#FFFFFF"
        strokeWidth={1.4}
        strokeLinecap="round"
        opacity={0.75}
      />
    </Svg>
  );
}

export function Brand({ size = 26 }: { size?: number }) {
  return (
    <View style={styles.brand} accessibilityLabel="Kin home" accessibilityRole="text">
      <KinMark size={size} />
      <Text style={[styles.wordmark, { fontSize: size * 1.02 }]} maxFontSizeMultiplier={1.4}>
        kin
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 44,
  },
  wordmark: {
    ...TEXT_STYLES.brand,
    color: COLORS.ink,
  },
});
