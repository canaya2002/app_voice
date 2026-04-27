/**
 * Typed Text component — enforces typography tokens.
 *
 * Apple-grade typography is a discipline. Every Text in the app should pick
 * one of the predefined variants. If a designer needs something off the menu,
 * they extend the menu — not paste a magic number into a stylesheet.
 */

import { Text as RNText, TextStyle, TextProps as RNTextProps, StyleProp } from 'react-native';
import { useTheme } from '@/lib/design/tokens';

export type TextVariant =
  | 'display-2xl'   // hero on landing
  | 'display-xl'    // section heroes
  | 'display-lg'    // page titles
  | 'display-md'    // card titles
  | 'title'         // sub-section title
  | 'subtitle'      // sub-titles
  | 'body'          // default
  | 'body-strong'   // emphasised body
  | 'callout'       // smaller paragraph
  | 'caption'       // labels, metadata
  | 'overline'      // ALL-CAPS labels
  | 'mono';         // numeric / monospace

export type TextTone = 'primary' | 'secondary' | 'tertiary' | 'inverse' | 'accent' | 'success' | 'warning' | 'danger';

interface TextProps extends Omit<RNTextProps, 'style'> {
  variant?: TextVariant;
  tone?: TextTone;
  weight?: 'regular' | 'medium' | 'semibold' | 'bold' | 'heavy';
  align?: 'left' | 'center' | 'right';
  italic?: boolean;
  style?: StyleProp<TextStyle>;
  children?: React.ReactNode;
}

export function Text({
  variant = 'body',
  tone = 'primary',
  weight,
  align,
  italic,
  style,
  children,
  ...rest
}: TextProps) {
  const t = useTheme();

  const variantStyle: TextStyle = (() => {
    const sz = t.typography.size;
    const w = t.typography.weight;
    const tr = t.typography.tracking;
    const lh = t.typography.lineHeight;
    switch (variant) {
      case 'display-2xl': return { fontSize: sz['6xl'], fontWeight: w.heavy, letterSpacing: tr.tighter, lineHeight: sz['6xl'] * lh.tight };
      case 'display-xl': return { fontSize: sz['5xl'], fontWeight: w.heavy, letterSpacing: tr.tighter, lineHeight: sz['5xl'] * lh.tight };
      case 'display-lg': return { fontSize: sz['4xl'], fontWeight: w.bold, letterSpacing: tr.tight, lineHeight: sz['4xl'] * lh.snug };
      case 'display-md': return { fontSize: sz['3xl'], fontWeight: w.bold, letterSpacing: tr.tight, lineHeight: sz['3xl'] * lh.snug };
      case 'title': return { fontSize: sz['2xl'], fontWeight: w.semibold, letterSpacing: tr.tight, lineHeight: sz['2xl'] * lh.snug };
      case 'subtitle': return { fontSize: sz.xl, fontWeight: w.semibold, lineHeight: sz.xl * lh.snug };
      case 'body': return { fontSize: sz.base, fontWeight: w.regular, lineHeight: sz.base * lh.normal };
      case 'body-strong': return { fontSize: sz.base, fontWeight: w.semibold, lineHeight: sz.base * lh.normal };
      case 'callout': return { fontSize: sz.sm, fontWeight: w.regular, lineHeight: sz.sm * lh.normal };
      case 'caption': return { fontSize: sz.xs, fontWeight: w.medium, lineHeight: sz.xs * lh.snug };
      case 'overline': return { fontSize: sz.xs, fontWeight: w.semibold, letterSpacing: tr.widest, textTransform: 'uppercase', lineHeight: sz.xs * lh.normal };
      case 'mono': return { fontSize: sz.base, fontWeight: w.medium, fontFamily: t.typography.fontFamily.mono as string };
    }
  })();

  const toneColor = (() => {
    switch (tone) {
      case 'primary': return t.text.primary;
      case 'secondary': return t.text.secondary;
      case 'tertiary': return t.text.tertiary;
      case 'inverse': return t.text.inverse;
      case 'accent': return t.accentPrimary;
      case 'success': return t.semantic.success;
      case 'warning': return t.semantic.warning;
      case 'danger': return t.semantic.danger;
    }
  })();

  const styleResolved: TextStyle = {
    ...variantStyle,
    color: toneColor,
    fontFamily: variant === 'mono' ? (t.typography.fontFamily.mono as string) : (t.typography.fontFamily.body as string),
    ...(weight ? { fontWeight: t.typography.weight[weight] } : {}),
    ...(align ? { textAlign: align } : {}),
    ...(italic ? { fontStyle: 'italic' as const } : {}),
  };

  return (
    <RNText {...rest} style={[styleResolved, style]}>
      {children}
    </RNText>
  );
}
