import { Platform } from 'react-native';

// Typography matching web UI (SF Pro Text/Inter)
export const TYPOGRAPHY = {
  // Font family - platform specific
  fontFamily: Platform.select({
    ios: '-apple-system, BlinkMacSystemFont, "SF Pro Text", Inter, sans-serif',
    android: 'Roboto, Inter, sans-serif',
    web: '-apple-system, BlinkMacSystemFont, "SF Pro Text", Inter, sans-serif',
    default: 'System',
  }),
  
  // Font sizes matching web design
  sizes: {
    xs: 12,
    sm: 14,
    base: 16,
    lg: 18,
    xl: 20,
    '2xl': 24,
    '3xl': 32,
    '4xl': 48,
  },
  
  // Font weights
  weights: {
    normal: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
  },
  
  // Line heights
  lineHeights: {
    tight: 1.2,
    normal: 1.5,
    relaxed: 1.75,
  },
  
  // Letter spacing
  letterSpacing: {
    tight: -0.5,
    normal: 0,
    wide: 0.5,
    wider: 1,
    widest: 3,
  },
};

// Pre-defined text styles
export const TEXT_STYLES = {
  // Brand text
  brand: {
    fontFamily: TYPOGRAPHY.fontFamily,
    fontSize: TYPOGRAPHY.sizes.sm,
    fontWeight: TYPOGRAPHY.weights.semibold,
    letterSpacing: TYPOGRAPHY.letterSpacing.widest,
    textTransform: 'uppercase' as const,
  },
  
  // Headings
  h1: {
    fontFamily: TYPOGRAPHY.fontFamily,
    fontSize: TYPOGRAPHY.sizes['4xl'],
    fontWeight: TYPOGRAPHY.weights.semibold,
    lineHeight: TYPOGRAPHY.lineHeights.tight,
  },
  h2: {
    fontFamily: TYPOGRAPHY.fontFamily,
    fontSize: TYPOGRAPHY.sizes['3xl'],
    fontWeight: TYPOGRAPHY.weights.semibold,
    lineHeight: TYPOGRAPHY.lineHeights.tight,
  },
  h3: {
    fontFamily: TYPOGRAPHY.fontFamily,
    fontSize: TYPOGRAPHY.sizes['2xl'],
    fontWeight: TYPOGRAPHY.weights.semibold,
    lineHeight: TYPOGRAPHY.lineHeights.tight,
  },
  
  // Body text
  body: {
    fontFamily: TYPOGRAPHY.fontFamily,
    fontSize: TYPOGRAPHY.sizes.base,
    fontWeight: TYPOGRAPHY.weights.normal,
    lineHeight: TYPOGRAPHY.lineHeights.normal,
  },
  bodyLarge: {
    fontFamily: TYPOGRAPHY.fontFamily,
    fontSize: TYPOGRAPHY.sizes.lg,
    fontWeight: TYPOGRAPHY.weights.normal,
    lineHeight: TYPOGRAPHY.lineHeights.normal,
  },
  
  // Labels
  label: {
    fontFamily: TYPOGRAPHY.fontFamily,
    fontSize: TYPOGRAPHY.sizes.sm,
    fontWeight: TYPOGRAPHY.weights.medium,
    lineHeight: TYPOGRAPHY.lineHeights.tight,
  },
  
  // Captions
  caption: {
    fontFamily: TYPOGRAPHY.fontFamily,
    fontSize: TYPOGRAPHY.sizes.xs,
    fontWeight: TYPOGRAPHY.weights.normal,
    lineHeight: TYPOGRAPHY.lineHeights.tight,
  },
};
