import { StyleSheet } from 'react-native';
import { COLORS } from './constants';

export const FONT = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
} as const;

/** Standardized design tokens — use these instead of hardcoded values */
export const DESIGN = {
  HEADER_SIZE: 28,
  SUBHEADER_SIZE: 19,
  BODY_SIZE: 15,
  CAPTION_SIZE: 13,
  CARD_PADDING: 18,
  SCREEN_PADDING: 20,
  CARD_RADIUS: 16,
  SECTION_GAP: 28,
} as const;

export const typography = StyleSheet.create({
  h1: { fontSize: 30, fontFamily: FONT.bold, color: COLORS.textPrimary, letterSpacing: -0.8 },
  h2: { fontSize: 23, fontFamily: FONT.bold, color: COLORS.textPrimary, letterSpacing: -0.5 },
  h3: { fontSize: 18, fontFamily: FONT.semibold, color: COLORS.textPrimary, letterSpacing: -0.2 },
  body: { fontSize: 15.5, fontFamily: FONT.regular, color: COLORS.textPrimary, lineHeight: 24 },
  bodySmall: { fontSize: 14, fontFamily: FONT.regular, color: COLORS.textSecondary, lineHeight: 21 },
  label: { fontSize: 11.5, fontFamily: FONT.semibold, color: COLORS.textSecondary, textTransform: 'uppercase', letterSpacing: 1 },
  caption: { fontSize: 12, fontFamily: FONT.regular, color: COLORS.textMuted },
  stat: { fontSize: 34, fontFamily: FONT.bold, color: COLORS.textPrimary, letterSpacing: -1 },
  statSmall: { fontSize: 22, fontFamily: FONT.bold, color: COLORS.textPrimary, letterSpacing: -0.5 },
});

export const shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 1,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.14,
    shadowRadius: 30,
    elevation: 10,
  },
  brand: {
    shadowColor: '#6CB4EE',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 20,
    elevation: 6,
  },
  glow: {
    shadowColor: '#6CB4EE',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.32,
    shadowRadius: 24,
    elevation: 10,
  },
} as const;

export const cardStyles = StyleSheet.create({
  base: {
    backgroundColor: COLORS.surface,
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  elevated: {
    backgroundColor: COLORS.surface,
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    ...shadows.md,
  },
  glass: {
    backgroundColor: 'rgba(255, 255, 255, 0.65)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.40)',
    borderRadius: 22,
    padding: 18,
    ...shadows.lg,
  },
  card3D: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    ...shadows.md,
  },
  subtle: {
    backgroundColor: COLORS.surfaceAlt,
    borderRadius: 16,
    padding: 16,
  },
});
