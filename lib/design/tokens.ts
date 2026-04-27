/**
 * Sythio Design Tokens — single source of truth for visual style.
 *
 * Philosophy: Apple-grade premium. Quiet, restrained, obsessive about consistency.
 * Neutrals carry 80% of the UI. The accent (violet) is used sparingly — primary
 * actions, focus rings, recording state, brand accents.
 *
 * To use: import the helper hooks (useTokens, useColors) — they resolve to the
 * correct light/dark variant based on the user's theme preference.
 */

import { Platform } from 'react-native';
import { useIsDark } from '@/lib/constants';

// ── Colors ──────────────────────────────────────────────────────────────────

const palette = {
  // Backgrounds — Apple-grade neutrals.
  bg: {
    primary: { light: '#FAFAFA', dark: '#0A0A0B' },
    secondary: { light: '#F4F4F5', dark: '#131316' },
    tertiary: { light: '#E9E9EC', dark: '#1C1C21' },
    elevated: { light: '#FFFFFF', dark: '#1A1A1E' },
    overlay: { light: 'rgba(0,0,0,0.04)', dark: 'rgba(255,255,255,0.04)' },
    scrim: { light: 'rgba(0,0,0,0.45)', dark: 'rgba(0,0,0,0.65)' },
  },

  text: {
    primary: { light: '#0A0A0B', dark: '#FAFAFA' },
    secondary: { light: '#52525B', dark: '#A1A1AA' },
    tertiary: { light: '#A1A1AA', dark: '#71717A' },
    inverse: { light: '#FAFAFA', dark: '#0A0A0B' },
    onAccent: { light: '#FFFFFF', dark: '#FFFFFF' },
  },

  border: {
    subtle: { light: 'rgba(0,0,0,0.06)', dark: 'rgba(255,255,255,0.08)' },
    default: { light: 'rgba(0,0,0,0.10)', dark: 'rgba(255,255,255,0.12)' },
    strong: { light: 'rgba(0,0,0,0.18)', dark: 'rgba(255,255,255,0.20)' },
  },

  // Accent — Sythio violet. The only saturated color in the UI.
  accent: {
    50:  '#F4F1FF',
    100: '#E9E2FF',
    200: '#D3C5FF',
    300: '#B69DFF',
    400: '#9670FF',
    500: '#7847FF',
    600: '#5F2BE0',
    700: '#4A1FB3',
    800: '#371685',
    900: '#240F58',
  },

  // Semantic — used with restraint. Most UI never sees these.
  success: { light: '#0F9D58', dark: '#34D399' },
  warning: { light: '#D97706', dark: '#FBBF24' },
  danger:  { light: '#DC2626', dark: '#F87171' },
  info:    { light: '#2563EB', dark: '#60A5FA' },

  // Recording — exception color, NOT in the accent system.
  recording: { light: '#EF4444', dark: '#EF4444' },
} as const;

// ── Typography ─────────────────────────────────────────────────────────────

export const typography = {
  fontFamily: {
    // System stack on iOS gives SF Pro Display/Text. Inter on Android for parity.
    display: Platform.select({
      ios: 'System',
      android: 'Inter',
      default: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
    }),
    body: Platform.select({
      ios: 'System',
      android: 'Inter',
      default: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
    }),
    mono: Platform.select({
      ios: 'Menlo',
      android: 'monospace',
      default: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    }),
  },
  size: {
    xs: 11,
    sm: 13,
    base: 15,
    md: 16,
    lg: 17,
    xl: 20,
    '2xl': 24,
    '3xl': 30,
    '4xl': 36,
    '5xl': 48,
    '6xl': 60,
  },
  weight: {
    regular: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
    heavy: '800' as const,
  },
  lineHeight: {
    tight: 1.15,
    snug: 1.3,
    normal: 1.5,
    relaxed: 1.65,
  },
  // Negative tracking on display sizes feels Apple-grade.
  tracking: {
    tighter: -0.6,
    tight: -0.3,
    normal: 0,
    wide: 0.3,
    widest: 0.8,
  },
} as const;

// ── Spacing ────────────────────────────────────────────────────────────────

export const spacing = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  7: 28,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
  20: 80,
  24: 96,
  32: 128,
} as const;

// ── Radii ──────────────────────────────────────────────────────────────────

export const radii = {
  none: 0,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 28,
  '3xl': 36,
  full: 9999,
} as const;

// ── Shadows ────────────────────────────────────────────────────────────────

const shadowsByTheme = {
  light: {
    none: { shadowColor: 'transparent', shadowOpacity: 0, shadowRadius: 0, shadowOffset: { width: 0, height: 0 }, elevation: 0 },
    xs: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 2, elevation: 1 },
    sm: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
    md: { shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.08, shadowRadius: 16, elevation: 6 },
    lg: { shadowColor: '#000', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.12, shadowRadius: 28, elevation: 12 },
    xl: { shadowColor: '#000', shadowOffset: { width: 0, height: 20 }, shadowOpacity: 0.18, shadowRadius: 48, elevation: 24 },
    glow: { shadowColor: palette.accent[500], shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.45, shadowRadius: 28, elevation: 8 },
    record: { shadowColor: palette.recording.light, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.5, shadowRadius: 24, elevation: 8 },
  },
  dark: {
    none: { shadowColor: 'transparent', shadowOpacity: 0, shadowRadius: 0, shadowOffset: { width: 0, height: 0 }, elevation: 0 },
    xs: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.2, shadowRadius: 2, elevation: 1 },
    sm: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.32, shadowRadius: 6, elevation: 2 },
    md: { shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.4, shadowRadius: 16, elevation: 6 },
    lg: { shadowColor: '#000', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.5, shadowRadius: 28, elevation: 12 },
    xl: { shadowColor: '#000', shadowOffset: { width: 0, height: 20 }, shadowOpacity: 0.6, shadowRadius: 48, elevation: 24 },
    glow: { shadowColor: palette.accent[400], shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.55, shadowRadius: 32, elevation: 8 },
    record: { shadowColor: palette.recording.dark, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.55, shadowRadius: 28, elevation: 8 },
  },
} as const;

// ── Motion ─────────────────────────────────────────────────────────────────

export const motion = {
  spring: {
    snappy: { damping: 18, stiffness: 220, mass: 0.6 },
    gentle: { damping: 22, stiffness: 140, mass: 0.8 },
    bouncy: { damping: 12, stiffness: 180, mass: 0.7 },
    overshoot: { damping: 10, stiffness: 200, mass: 0.55 },
  },
  duration: {
    instant: 100,
    fast: 180,
    base: 240,
    slow: 400,
    slower: 600,
  },
  // Bezier curves stored as readonly tuple for Easing.bezier.
  easing: {
    out: [0.16, 1, 0.3, 1] as const,
    inOut: [0.65, 0, 0.35, 1] as const,
    bounce: [0.34, 1.56, 0.64, 1] as const,
  },
  stagger: {
    fast: 30,
    base: 60,
    slow: 100,
  },
} as const;

// ── Blur ───────────────────────────────────────────────────────────────────

export const blur = {
  subtle: 12,
  default: 24,
  strong: 40,
  intense: 60,
} as const;

// ── Z-index ────────────────────────────────────────────────────────────────

export const zIndex = {
  base: 0,
  raised: 10,
  sticky: 20,
  overlay: 30,
  modal: 40,
  toast: 50,
  tooltip: 60,
} as const;

// ── Layout ─────────────────────────────────────────────────────────────────

export const layout = {
  maxContentWidth: 1200,
  maxReadingWidth: 720,
  tabBarHeight: 84,
  headerHeight: 56,
  fabSize: 56,
  fabHeroSize: 96,
} as const;

// ── Theme builder ──────────────────────────────────────────────────────────

type Mode = 'light' | 'dark';

function pick<T extends { light: string; dark: string }>(t: T, m: Mode): string {
  return t[m];
}

export function buildTheme(mode: Mode) {
  return {
    mode,
    bg: {
      primary: pick(palette.bg.primary, mode),
      secondary: pick(palette.bg.secondary, mode),
      tertiary: pick(palette.bg.tertiary, mode),
      elevated: pick(palette.bg.elevated, mode),
      overlay: pick(palette.bg.overlay, mode),
      scrim: pick(palette.bg.scrim, mode),
    },
    text: {
      primary: pick(palette.text.primary, mode),
      secondary: pick(palette.text.secondary, mode),
      tertiary: pick(palette.text.tertiary, mode),
      inverse: pick(palette.text.inverse, mode),
      onAccent: pick(palette.text.onAccent, mode),
    },
    border: {
      subtle: pick(palette.border.subtle, mode),
      default: pick(palette.border.default, mode),
      strong: pick(palette.border.strong, mode),
    },
    accent: palette.accent,
    accentPrimary: palette.accent[500],
    accentHover: palette.accent[600],
    accentSubtle: mode === 'light' ? palette.accent[50] : palette.accent[900],
    accentSubtleText: mode === 'light' ? palette.accent[700] : palette.accent[200],
    semantic: {
      success: pick(palette.success, mode),
      warning: pick(palette.warning, mode),
      danger: pick(palette.danger, mode),
      info: pick(palette.info, mode),
    },
    recording: pick(palette.recording, mode),
    shadows: shadowsByTheme[mode],
    typography,
    spacing,
    radii,
    motion,
    blur,
    zIndex,
    layout,
  } as const;
}

export type Theme = ReturnType<typeof buildTheme>;

const lightTheme = buildTheme('light');
const darkTheme = buildTheme('dark');

/** Hook — returns the active theme based on user preference. */
export function useTheme(): Theme {
  const dark = useIsDark();
  return dark ? darkTheme : lightTheme;
}

/** Convenience — only colors. */
export function useColors() {
  return useTheme();
}

/** For static contexts (StyleSheet.create), grab without hook — defaults to light. */
export const tokens = lightTheme;
export const tokensDark = darkTheme;
