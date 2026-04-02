import { useEffect, useState, useCallback } from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
  interpolate,
} from 'react-native-reanimated';
import { FONT } from '@/lib/styles';

const TIPS = [
  'Di "Resumen" y obtén lo esencial al instante',
  'Graba reuniones y recibe las tareas automáticamente',
  'Usa plantillas para cada tipo de nota',
  'Comparte notas con tu equipo en un toque',
  'Busca cualquier cosa que hayas dicho',
  'Convierte ideas sueltas en planes de acción',
  'Organiza por carpetas, etiquetas o proyectos',
  'Funciona incluso sin conexión',
];

export default function LoadingScreen() {
  const [tipIndex, setTipIndex] = useState(0);
  const tipOpacity = useSharedValue(1);
  const logoScale = useSharedValue(1);
  const dot1 = useSharedValue(0);
  const dot2 = useSharedValue(0);
  const dot3 = useSharedValue(0);

  // Logo pulse
  useEffect(() => {
    logoScale.value = withRepeat(withSequence(
      withTiming(1.08, { duration: 1800, easing: Easing.inOut(Easing.sin) }),
      withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.sin) }),
    ), -1, true);
  }, [logoScale]);

  // Loading dots
  useEffect(() => {
    const animate = (sv: Animated.SharedValue<number>, delay: number) => {
      sv.value = withRepeat(
        withSequence(
          withTiming(0, { duration: delay }),
          withTiming(1, { duration: 400, easing: Easing.out(Easing.cubic) }),
          withTiming(0, { duration: 400, easing: Easing.in(Easing.cubic) }),
          withTiming(0, { duration: 1200 - delay }),
        ), -1,
      );
    };
    animate(dot1, 0);
    animate(dot2, 200);
    animate(dot3, 400);
  }, [dot1, dot2, dot3]);

  // Rotating tips
  const cycleTip = useCallback(() => {
    tipOpacity.value = withTiming(0, { duration: 400, easing: Easing.in(Easing.ease) }, () => {
      // After fade out, change tip and fade in
    });
    setTimeout(() => {
      setTipIndex(prev => (prev + 1) % TIPS.length);
      tipOpacity.value = withTiming(1, { duration: 500, easing: Easing.out(Easing.ease) });
    }, 450);
  }, [tipOpacity]);

  useEffect(() => {
    const interval = setInterval(cycleTip, 3500);
    return () => clearInterval(interval);
  }, [cycleTip]);

  const logoAnim = useAnimatedStyle(() => ({ transform: [{ scale: logoScale.value }] }));
  const tipAnim = useAnimatedStyle(() => ({ opacity: tipOpacity.value }));
  const d1 = useAnimatedStyle(() => ({ opacity: interpolate(dot1.value, [0, 1], [0.2, 1]), transform: [{ translateY: interpolate(dot1.value, [0, 1], [0, -6]) }] }));
  const d2 = useAnimatedStyle(() => ({ opacity: interpolate(dot2.value, [0, 1], [0.2, 1]), transform: [{ translateY: interpolate(dot2.value, [0, 1], [0, -6]) }] }));
  const d3 = useAnimatedStyle(() => ({ opacity: interpolate(dot3.value, [0, 1], [0.2, 1]), transform: [{ translateY: interpolate(dot3.value, [0, 1], [0, -6]) }] }));

  return (
    <View style={s.root}>
      {/* Logo */}
      <Animated.View style={logoAnim}>
        <Image source={require('@/assets/images/icon.png')} style={s.logo} />
      </Animated.View>

      {/* Loading dots */}
      <View style={s.dotsRow}>
        <Animated.View style={[s.dot, d1]} />
        <Animated.View style={[s.dot, d2]} />
        <Animated.View style={[s.dot, d3]} />
      </View>

      {/* Tip */}
      <Animated.View style={[s.tipWrap, tipAnim]}>
        <Text style={s.tipText}>{TIPS[tipIndex]}</Text>
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1, backgroundColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 40,
  },
  logo: { width: 64, height: 64, borderRadius: 16, marginBottom: 32 },
  dotsRow: { flexDirection: 'row', gap: 8, marginBottom: 40 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#111111' },
  tipWrap: { position: 'absolute', bottom: 100, left: 40, right: 40 },
  tipText: {
    fontSize: 15, fontFamily: FONT.regular, color: '#999999',
    textAlign: 'center', lineHeight: 22,
  },
});
