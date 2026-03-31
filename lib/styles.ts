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
  HEADER_SIZE: 26,
  SUBHEADER_SIZE: 18,
  BODY_SIZE: 15,
  CAPTION_SIZE: 13,
  CARD_PADDING: 16,
  SCREEN_PADDING: 20,
  CARD_RADIUS: 14,
  SECTION_GAP: 24,
} as const;

export const typography = StyleSheet.create({
  h1: { fontSize: 28, fontFamily: FONT.bold, color: COLORS.textPrimary, letterSpacing: -0.5 },
  h2: { fontSize: 22, fontFamily: FONT.bold, color: COLORS.textPrimary, letterSpacing: -0.3 },
  h3: { fontSize: 18, fontFamily: FONT.semibold, color: COLORS.textPrimary },
  body: { fontSize: 16, fontFamily: FONT.regular, color: COLORS.textPrimary, lineHeight: 24 },
  bodySmall: { fontSize: 14, fontFamily: FONT.regular, color: COLORS.textSecondary, lineHeight: 20 },
  label: { fontSize: 12, fontFamily: FONT.semibold, color: COLORS.textSecondary, textTransform: 'uppercase', letterSpacing: 0.8 },
  caption: { fontSize: 12, fontFamily: FONT.regular, color: COLORS.textMuted },
  stat: { fontSize: 32, fontFamily: FONT.bold, color: COLORS.textPrimary },
  statSmall: { fontSize: 20, fontFamily: FONT.bold, color: COLORS.textPrimary },
});

export const shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 8,
  },
  brand: {
    shadowColor: '#8FD3FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 6,
  },
  glow: {
    shadowColor: '#8FD3FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 10,
  },
} as const;

export const cardStyles = StyleSheet.create({
  base: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  elevated: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 20,
    ...shadows.md,
  },
  glass: {
    backgroundColor: 'rgba(255, 255, 255, 0.72)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.5)',
    borderRadius: 20,
    padding: 16,
    ...shadows.lg,
  },
  card3D: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    ...shadows.md,
  },
  subtle: {
    backgroundColor: COLORS.surfaceAlt,
    borderRadius: 14,
    padding: 14,
  },
});
