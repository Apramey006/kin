// Typography matching the web app (system font stack = SF on iOS).
export const TYPOGRAPHY = {
  sizes: {
    xs: 12,
    sm: 14,
    base: 16,
    lg: 18,
    xl: 20,
    '2xl': 24,
    '3xl': 32,
    '4xl': 44,
  },
  weights: {
    normal: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
  },
};

export const TEXT_STYLES = {
  brand: {
    fontSize: 26,
    fontWeight: '600' as const,
    letterSpacing: -1.6,
  },
  h1: {
    fontSize: 34,
    fontWeight: '600' as const,
    letterSpacing: -1.1,
    lineHeight: 39,
  },
  h2: {
    fontSize: 22,
    fontWeight: '600' as const,
    letterSpacing: -0.4,
    lineHeight: 27,
  },
  h3: {
    fontSize: 17,
    fontWeight: '600' as const,
    letterSpacing: -0.2,
  },
  body: {
    fontSize: 16,
    fontWeight: '400' as const,
    lineHeight: 24,
  },
  bodyLarge: {
    fontSize: 18,
    fontWeight: '400' as const,
    lineHeight: 27,
  },
  label: {
    fontSize: 14,
    fontWeight: '500' as const,
  },
  caption: {
    fontSize: 12,
    fontWeight: '400' as const,
    lineHeight: 18,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '600' as const,
    letterSpacing: 0.2,
  },
};
