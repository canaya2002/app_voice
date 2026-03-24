import { StyleSheet } from 'react-native';
import { COLORS } from './constants';

export const typography = StyleSheet.create({
  h1: { fontSize: 28, fontWeight: '700', color: COLORS.textPrimary, letterSpacing: -0.5 },
  h2: { fontSize: 22, fontWeight: '700', color: COLORS.textPrimary, letterSpacing: -0.3 },
  h3: { fontSize: 18, fontWeight: '600', color: COLORS.textPrimary },
  body: { fontSize: 16, fontWeight: '400', color: COLORS.textPrimary, lineHeight: 24 },
  bodySmall: { fontSize: 14, fontWeight: '400', color: COLORS.textSecondary, lineHeight: 20 },
  label: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
  caption: { fontSize: 12, fontWeight: '400', color: COLORS.textMuted },
  stat: { fontSize: 32, fontWeight: '700', color: COLORS.textPrimary },
  statSmall: { fontSize: 20, fontWeight: '700', color: COLORS.textPrimary },
});

export const shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 5,
  },
  purple: {
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 5,
  },
} as const;

export const cardStyles = StyleSheet.create({
  base: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 16,
    ...shadows.md,
  },
  elevated: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: 20,
    ...shadows.lg,
  },
  subtle: {
    backgroundColor: COLORS.surfaceAlt,
    borderRadius: 14,
    padding: 14,
  },
});
