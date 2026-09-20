// Mobile app theme matching web UI design
export const COLORS = {
  // Web UI colors
  paper: '#FBF8F3',
  ink: '#1F1B16',
  primary: '#2F5D50',
  stage: '#0E1116',
  white: '#FFFFFF',
  
  // Derived colors
  inkLight: `${'#1F1B16'}99`, // 60% opacity
  inkLighter: `${'#1F1B16'}66`, // 40% opacity
  inkLightest: `${'#1F1B16'}1A`, // 10% opacity
  primaryLight: `${'#2F5D50'}E6`, // 90% opacity
  primaryLighter: `${'#2F5D50'}99`, // 60% opacity
  primaryLightest: `${'#2F5D50'}1A`, // 10% opacity
  stageLight: `${'#0E1116'}99`, // 60% opacity
  stageLighter: `${'#0E1116'}66`, // 40% opacity
  stageLightest: `${'#0E1116'}1A`, // 10% opacity
  
  // Status colors
  success: '#34D399',
  warning: '#FBBF24',
  error: '#F87171',
  info: '#60A5FA',
  
  // Utility colors
  divider: `${'#1F1B16'}1A`,
  overlay: `${'#0E1116'}80`,
  background: '#FAFAFA',
};

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
};

export const BORDER_RADIUS = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
};

export const FONT_SIZES = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  xxxxl: 48,
};

export const FONT_WEIGHTS = {
  normal: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
};

export const SHADOWS = {
  sm: {
    shadowColor: COLORS.ink,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  md: {
    shadowColor: COLORS.ink,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
  },
  lg: {
    shadowColor: COLORS.ink,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 8,
  },
};
