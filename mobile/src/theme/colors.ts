// Theme matching the web app's design tokens (app/globals.css :root).
export const COLORS = {
  paper: '#F5F5F7',
  surface: '#FFFFFF',
  ink: '#1D1D1F',
  muted: '#68686D',
  line: '#E5E5E7',
  accent: '#0071E3',
  accentHover: '#0066CC',
  accentSoft: '#E8F2FF',
  success: '#257A3E',
  danger: '#D32F28',

  // Component surfaces
  segmented: '#EDEDF0',
  card: '#F5F5F7',
  fieldBg: '#FFFFFF',
  avatarBg: '#E7E7EB',
  avatarInk: '#525258',
  recordRed: '#DF332B',
  cameraDark: '#151518',
  sheetScrim: 'rgba(0,0,0,0.28)',

  // Notices
  noticeBg: '#F0F5FC',
  noticeInk: '#325478',
  noticeErrorBg: '#FFF1F0',
  noticeErrorInk: '#A52420',
  noticeSuccessBg: '#EDF6EF',
  noticeSuccessInk: '#276B3B',

  // Aliases kept for older helpers
  white: '#FFFFFF',
  divider: 'rgba(29,29,31,0.10)',
  inkLight: 'rgba(29,29,31,0.66)',
  inkLighter: 'rgba(29,29,31,0.4)',
  inkLightest: 'rgba(29,29,31,0.08)',
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
  pill: 999,
};

export const FONT_SIZES = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  xxxxl: 44,
};

export const SHADOWS = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.14,
    shadowRadius: 30,
    elevation: 10,
  },
};
