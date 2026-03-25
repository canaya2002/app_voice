import { StyleSheet } from 'react-native';
import { COLORS } from './constants';

export const FONT = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
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
    shadowRadius: 3,
    elevation: 1,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  purple: {
    shadowColor: '#0B0B0B',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 6,
  },
} as const;

export const cardStyles = StyleSheet.create({
  base: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
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
  subtle: {
    backgroundColor: COLORS.surfaceAlt,
    borderRadius: 12,
    padding: 14,
  },
});
