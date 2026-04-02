import { useRef, useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  useWindowDimensions,
  Platform,
  TouchableOpacity,
  PanResponder,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
  withSpring,
  Easing,
  interpolate,
  FadeIn,
  FadeOut,
  FadeInUp,
  FadeInDown,
  runOnJS,
} from 'react-native-reanimated';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { FONT } from '@/lib/styles';
import { hapticButtonPress, hapticProcessingDone, hapticSelection } from '@/lib/haptics';
import AnimatedPressable from '@/components/AnimatedPressable';

export const ONBOARDING_KEY = 'sythio_onboarding_done';
export const LANGUAGE_KEY = 'sythio_user_language';

// ---------------------------------------------------------------------------
// Languages
// ---------------------------------------------------------------------------

const LANGUAGES = [
  { code: 'es', label: 'Español', flag: '🇪🇸' },
  { code: 'en', label: 'English', flag: '🇺🇸' },
  { code: 'pt', label: 'Português', flag: '🇧🇷' },
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
  { code: 'it', label: 'Italiano', flag: '🇮🇹' },
];

// ---------------------------------------------------------------------------
// Translations
// ---------------------------------------------------------------------------

const TX: Record<string, { pages: { title: string; subtitle: string }[]; skip: string }> = {
  es: {
    skip: 'Saltar',
    pages: [
      { title: 'Tu voz\ntiene poder', subtitle: 'Transforma lo que dices en informacion clara, organizada y lista para usar.' },
      { title: 'Habla.\nTe escuchamos.', subtitle: 'Graba reuniones, ideas, clases o cualquier momento importante. Solo toca y habla.' },
      { title: 'Inteligencia\nque entiende', subtitle: 'Resumenes, tareas, reportes, planes de accion. Un audio, multiples resultados.' },
      { title: 'Plantillas para\ncada momento', subtitle: 'Reunion, idea rapida, clase, brainstorm. Cada contexto tiene su formato ideal.' },
      { title: 'Todo listo', subtitle: 'Empieza a transformar tu voz en claridad y accion.' },
    ],
  },
  en: {
    skip: 'Skip',
    pages: [
      { title: 'Your voice\nhas power', subtitle: 'Transform what you say into clear, organized information ready to use.' },
      { title: 'Speak.\nWe listen.', subtitle: 'Record meetings, ideas, classes or any important moment. Just tap and talk.' },
      { title: 'Intelligence\nthat understands', subtitle: 'Summaries, tasks, reports, action plans. One audio, multiple results.' },
      { title: 'Templates for\nevery moment', subtitle: 'Meeting, quick idea, class, brainstorm. Each context has its ideal format.' },
      { title: 'All set', subtitle: 'Start transforming your voice into clarity and action.' },
    ],
  },
  pt: {
    skip: 'Pular',
    pages: [
      { title: 'Sua voz\ntem poder', subtitle: 'Transforme o que você diz em informação clara, organizada e pronta para usar.' },
      { title: 'Fale.\nNós ouvimos.', subtitle: 'Grave reuniões, ideias, aulas ou qualquer momento importante. Apenas toque e fale.' },
      { title: 'Inteligência\nque entende', subtitle: 'Resumos, tarefas, relatórios, planos de ação. Um áudio, múltiplos resultados.' },
      { title: 'Modelos para\ncada momento', subtitle: 'Reunião, ideia rápida, aula, brainstorm. Cada contexto tem seu formato ideal.' },
      { title: 'Tudo pronto', subtitle: 'Comece a transformar sua voz em clareza e ação.' },
    ],
  },
  fr: {
    skip: 'Passer',
    pages: [
      { title: 'Ta voix\na du pouvoir', subtitle: 'Transforme ce que tu dis en information claire, organisée et prête à utiliser.' },
      { title: 'Parle.\nNous écoutons.', subtitle: 'Enregistre réunions, idées, cours ou tout moment important. Touche et parle.' },
      { title: 'Intelligence\nqui comprend', subtitle: 'Résumés, tâches, rapports, plans d\'action. Un audio, plusieurs résultats.' },
      { title: 'Modèles pour\nchaque moment', subtitle: 'Réunion, idée rapide, cours, brainstorm. Chaque contexte a son format idéal.' },
      { title: 'Tout est prêt', subtitle: 'Commence à transformer ta voix en clarté et action.' },
    ],
  },
  it: {
    skip: 'Salta',
    pages: [
      { title: 'La tua voce\nha potere', subtitle: 'Trasforma quello che dici in informazione chiara, organizzata e pronta all\'uso.' },
      { title: 'Parla.\nTi ascoltiamo.', subtitle: 'Registra riunioni, idee, lezioni o qualsiasi momento importante. Tocca e parla.' },
      { title: 'Intelligenza\nche capisce', subtitle: 'Riassunti, attività, report, piani d\'azione. Un audio, molteplici risultati.' },
      { title: 'Modelli per\nogni momento', subtitle: 'Riunione, idea rapida, lezione, brainstorm. Ogni contesto ha il suo formato ideale.' },
      { title: 'Tutto pronto', subtitle: 'Inizia a trasformare la tua voce in chiarezza e azione.' },
    ],
  },
};

// ---------------------------------------------------------------------------
// Language picker
// ---------------------------------------------------------------------------

function LanguagePicker({ onSelect }: { onSelect: (code: string) => void }) {
  const [selected, setSelected] = useState<string | null>(null);
  const logoScale = useSharedValue(1);

  useEffect(() => {
    logoScale.value = withRepeat(withSequence(
      withTiming(1.06, { duration: 2200, easing: Easing.inOut(Easing.sin) }),
      withTiming(1, { duration: 2200, easing: Easing.inOut(Easing.sin) }),
    ), -1, true);
  }, [logoScale]);

  const logoAnim = useAnimatedStyle(() => ({ transform: [{ scale: logoScale.value }] }));

  const handleSelect = (code: string) => {
    hapticSelection();
    setSelected(code);
    setTimeout(() => onSelect(code), 350);
  };

  return (
    <View style={langStyles.root}>
      <SafeAreaView style={langStyles.safe}>
        <View style={langStyles.content}>
          <Animated.View entering={FadeIn.duration(800)} style={langStyles.logoWrap}>
            <Animated.View style={logoAnim}>
              <Image source={require('@/assets/images/icon.png')} style={langStyles.logo} />
            </Animated.View>
          </Animated.View>
          <Animated.View entering={FadeInDown.delay(400).duration(500)}>
            <Text style={langStyles.title}>Choose your language</Text>
            <Text style={langStyles.sub}>You can change this later</Text>
          </Animated.View>
          <View style={langStyles.grid}>
            {LANGUAGES.map((l, i) => (
              <Animated.View key={l.code} entering={FadeInUp.delay(500 + i * 80).duration(400)}>
                <TouchableOpacity onPress={() => handleSelect(l.code)} activeOpacity={0.7}
                  style={[langStyles.btn, selected === l.code && langStyles.btnActive]}>
                  <Text style={langStyles.flag}>{l.flag}</Text>
                  <Text style={[langStyles.label, selected === l.code && langStyles.labelActive]}>{l.label}</Text>
                  {selected === l.code && (
                    <Animated.View entering={FadeIn.duration(200)} style={{ marginLeft: 'auto' }}>
                      <Ionicons name="checkmark-circle" size={22} color="#111" />
                    </Animated.View>
                  )}
                </TouchableOpacity>
              </Animated.View>
            ))}
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

const langStyles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFFFFF' },
  safe: { flex: 1 },
  content: { flex: 1, paddingHorizontal: 28, justifyContent: 'center' },
  logoWrap: { alignItems: 'center', marginBottom: 40 },
  logo: { width: 72, height: 72, borderRadius: 18 },
  title: { fontSize: 24, fontFamily: FONT.bold, color: '#111', textAlign: 'center', marginBottom: 6 },
  sub: { fontSize: 14, fontFamily: FONT.regular, color: '#999', textAlign: 'center', marginBottom: 32 },
  grid: { gap: 10 },
  btn: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: '#FAFAFA', borderRadius: 16, padding: 18,
    borderWidth: 1.5, borderColor: 'rgba(0,0,0,0.05)',
  },
  btnActive: { borderColor: '#111', backgroundColor: '#F5F5F5' },
  flag: { fontSize: 26 },
  label: { fontSize: 16, fontFamily: FONT.medium, color: '#333' },
  labelActive: { fontFamily: FONT.semibold, color: '#111' },
});

// ---------------------------------------------------------------------------
// Page meta
// ---------------------------------------------------------------------------

type IconAnimation = 'twinkle' | 'heartbeat' | 'flicker' | 'vibrate' | 'bounce';

interface TutorialPage {
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconBg: string;
  anim: IconAnimation;
}

const PAGE_META: TutorialPage[] = [
  { id: 'welcome', icon: 'sparkles', iconBg: '#111111', anim: 'twinkle' },
  { id: 'record', icon: 'mic', iconBg: '#1A1A1A', anim: 'heartbeat' },
  { id: 'magic', icon: 'bulb', iconBg: '#222222', anim: 'flicker' },
  { id: 'templates', icon: 'grid', iconBg: '#2A2A2A', anim: 'vibrate' },
  { id: 'ready', icon: 'checkmark-circle', iconBg: '#111111', anim: 'bounce' },
];

const TOTAL_TUTORIAL = PAGE_META.length;

// ---------------------------------------------------------------------------
// Per-icon alive animations
// ---------------------------------------------------------------------------

function useIconAnimation(anim: IconAnimation) {
  const v1 = useSharedValue(0);
  const v2 = useSharedValue(0);
  useEffect(() => {
    switch (anim) {
      case 'twinkle':
        v1.value = withRepeat(withSequence(withTiming(1, { duration: 600, easing: Easing.out(Easing.cubic) }), withTiming(0, { duration: 1400, easing: Easing.inOut(Easing.sin) }), withTiming(0.7, { duration: 400, easing: Easing.out(Easing.cubic) }), withTiming(0, { duration: 1600, easing: Easing.inOut(Easing.sin) })), -1);
        v2.value = withRepeat(withSequence(withTiming(1, { duration: 800, easing: Easing.out(Easing.cubic) }), withTiming(-1, { duration: 800, easing: Easing.inOut(Easing.sin) }), withTiming(0, { duration: 400 }), withTiming(0, { duration: 2000 })), -1);
        break;
      case 'heartbeat':
        v1.value = withRepeat(withSequence(withTiming(1, { duration: 120, easing: Easing.out(Easing.cubic) }), withTiming(0, { duration: 180, easing: Easing.in(Easing.cubic) }), withTiming(0.7, { duration: 100, easing: Easing.out(Easing.cubic) }), withTiming(0, { duration: 200, easing: Easing.in(Easing.cubic) }), withTiming(0, { duration: 1400 })), -1);
        break;
      case 'flicker':
        v1.value = withRepeat(withSequence(withTiming(1, { duration: 100 }), withTiming(0.3, { duration: 80 }), withTiming(1, { duration: 60 }), withTiming(0.5, { duration: 120 }), withTiming(1, { duration: 100 }), withTiming(1, { duration: 2500 }), withTiming(0.2, { duration: 150 }), withTiming(1, { duration: 100 }), withTiming(1, { duration: 1500 })), -1);
        break;
      case 'vibrate':
        v1.value = withRepeat(withSequence(withTiming(1, { duration: 50 }), withTiming(-1, { duration: 50 }), withTiming(0.5, { duration: 50 }), withTiming(-0.5, { duration: 50 }), withTiming(0, { duration: 50 }), withTiming(0, { duration: 2500 })), -1);
        v2.value = withDelay(25, withRepeat(withSequence(withTiming(0.8, { duration: 50 }), withTiming(-0.8, { duration: 50 }), withTiming(0.3, { duration: 50 }), withTiming(-0.3, { duration: 50 }), withTiming(0, { duration: 50 }), withTiming(0, { duration: 2500 })), -1));
        break;
      case 'bounce':
        v1.value = withRepeat(withSequence(withSpring(1, { damping: 3, stiffness: 300 }), withTiming(1, { duration: 800 }), withSpring(0, { damping: 8, stiffness: 200 }), withTiming(0, { duration: 1200 })), -1);
        v2.value = withRepeat(withSequence(withTiming(1, { duration: 300, easing: Easing.out(Easing.cubic) }), withTiming(0, { duration: 500, easing: Easing.in(Easing.cubic) }), withTiming(0, { duration: 2000 })), -1);
        break;
    }
  }, [anim, v1, v2]);
  return useAnimatedStyle(() => {
    switch (anim) {
      case 'twinkle': return { transform: [{ scale: 1 + v1.value * 0.12 }, { rotate: `${v2.value * 15}deg` }] };
      case 'heartbeat': return { transform: [{ scale: 1 + v1.value * 0.18 }] };
      case 'flicker': return { opacity: 0.4 + v1.value * 0.6, transform: [{ scale: 0.96 + v1.value * 0.04 }] };
      case 'vibrate': return { transform: [{ translateX: v1.value * 2 }, { translateY: v2.value * 2 }] };
      case 'bounce': return { transform: [{ scale: 1 + v1.value * 0.15 }, { translateY: -v2.value * 8 }] };
      default: return {};
    }
  });
}

// ---------------------------------------------------------------------------
// Illustration with diffused wave/glow behind icon
// ---------------------------------------------------------------------------

function PageIllustration({ icon, iconBg, anim }: { icon: keyof typeof Ionicons.glyphMap; iconBg: string; anim: IconAnimation }) {
  const breathe = useSharedValue(0);
  const wave = useSharedValue(0);
  const float = useSharedValue(0);
  const iconAlive = useIconAnimation(anim);

  useEffect(() => {
    breathe.value = withRepeat(withSequence(
      withTiming(1, { duration: 2800, easing: Easing.inOut(Easing.sin) }),
      withTiming(0, { duration: 2800, easing: Easing.inOut(Easing.sin) }),
    ), -1, true);
    wave.value = withRepeat(withSequence(
      withTiming(1, { duration: 2200, easing: Easing.inOut(Easing.sin) }),
      withTiming(0, { duration: 2200, easing: Easing.inOut(Easing.sin) }),
    ), -1, true);
    float.value = withRepeat(withSequence(
      withTiming(1, { duration: 3000, easing: Easing.inOut(Easing.sin) }),
      withTiming(0, { duration: 3000, easing: Easing.inOut(Easing.sin) }),
    ), -1, true);
  }, [breathe, wave, float]);

  // Large diffused glow wave behind icon
  const glowWave1 = useAnimatedStyle(() => ({
    opacity: interpolate(breathe.value, [0, 1], [0.06, 0.16]),
    transform: [{ scale: interpolate(breathe.value, [0, 1], [0.8, 1.15]) }],
  }));
  const glowWave2 = useAnimatedStyle(() => ({
    opacity: interpolate(wave.value, [0, 1], [0.03, 0.1]),
    transform: [{ scale: interpolate(wave.value, [0, 1], [0.9, 1.3]) }],
  }));
  const floatStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(float.value, [0, 1], [0, -10]) }],
  }));

  return (
    <Animated.View style={[ill.container, floatStyle]}>
      {/* Diffused wave layers */}
      <Animated.View style={[ill.waveLarge, glowWave2]} />
      <Animated.View style={[ill.waveMedium, glowWave1]} />
      {/* Icon */}
      <Animated.View style={iconAlive}>
        <View style={[ill.iconCircle, {
          backgroundColor: iconBg,
          ...Platform.select({
            ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 14 }, shadowOpacity: 0.35, shadowRadius: 30 },
            android: { elevation: 20 },
          }),
        }]}>
          <Ionicons name={icon} size={56} color="#FFFFFF" />
        </View>
      </Animated.View>
    </Animated.View>
  );
}

const ill = StyleSheet.create({
  container: { width: 280, height: 280, alignItems: 'center', justifyContent: 'center' },
  waveLarge: {
    position: 'absolute', width: 260, height: 260, borderRadius: 130,
    backgroundColor: '#E0E0E0',
  },
  waveMedium: {
    position: 'absolute', width: 200, height: 200, borderRadius: 100,
    backgroundColor: '#D0D0D0',
  },
  iconCircle: { width: 115, height: 115, borderRadius: 57.5, alignItems: 'center', justifyContent: 'center' },
});

// ---------------------------------------------------------------------------
// 3D Play button — pure black, no gray lines
// ---------------------------------------------------------------------------

function PlayButton({ onPress }: { onPress: () => void }) {
  const breathe = useSharedValue(0);

  useEffect(() => {
    breathe.value = withRepeat(withSequence(
      withTiming(1, { duration: 2400, easing: Easing.inOut(Easing.sin) }),
      withTiming(0, { duration: 2400, easing: Easing.inOut(Easing.sin) }),
    ), -1, true);
  }, [breathe]);

  const btnFloat = useAnimatedStyle(() => ({
    transform: [
      { scale: interpolate(breathe.value, [0, 1], [1, 1.05]) },
      { translateY: interpolate(breathe.value, [0, 1], [0, -5]) },
    ],
  }));

  return (
    <View style={playS.wrapper}>
      <AnimatedPressable onPress={onPress} scaleDown={0.85}>
        <Animated.View style={[playS.btn, btnFloat]}>
          <View style={playS.highlightTop} />
          <View style={playS.highlightBottom} />
          <Ionicons name="play" size={56} color="#FFFFFF" style={{ marginLeft: 6 }} />
        </Animated.View>
      </AnimatedPressable>
    </View>
  );
}

const playS = StyleSheet.create({
  wrapper: { alignItems: 'center', justifyContent: 'center', width: 240, height: 240 },
  btn: {
    width: 150, height: 150, borderRadius: 75,
    backgroundColor: '#000000', alignItems: 'center', justifyContent: 'center',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 20 }, shadowOpacity: 0.6, shadowRadius: 40 },
      android: { elevation: 30 },
    }),
  },
  highlightTop: {
    position: 'absolute', top: 6, left: 20, right: 20, height: 35,
    borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.06)',
  },
  highlightBottom: {
    position: 'absolute', bottom: 0, left: 0, right: 0, height: 75,
    borderBottomLeftRadius: 75, borderBottomRightRadius: 75,
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
});

// ---------------------------------------------------------------------------
// Full-screen black transition overlay
// ---------------------------------------------------------------------------

function TransitionOverlay({ expanding, onDone }: { expanding: boolean; onDone: () => void }) {
  const opacity = useSharedValue(0);
  useEffect(() => {
    if (expanding) {
      opacity.value = withTiming(1, { duration: 600, easing: Easing.inOut(Easing.cubic) }, () => {
        runOnJS(onDone)();
      });
    }
  }, [expanding, opacity, onDone]);
  const anim = useAnimatedStyle(() => ({ opacity: opacity.value }));
  if (!expanding) return null;
  return <Animated.View style={[{ position: 'absolute', top: -60, left: 0, right: 0, bottom: -60, backgroundColor: '#000000', zIndex: 100 }, anim]} />;
}

// ---------------------------------------------------------------------------
// Dot + PageDots
// ---------------------------------------------------------------------------

function Dot({ index, pageIndicator }: { index: number; pageIndicator: Animated.SharedValue<number> }) {
  const anim = useAnimatedStyle(() => {
    const isActive = Math.round(pageIndicator.value) === index;
    return {
      width: withSpring(isActive ? 28 : 8, { damping: 18, stiffness: 200 }),
      backgroundColor: isActive ? '#111111' : '#D1D1D1',
      opacity: withTiming(isActive ? 1 : 0.5, { duration: 300 }),
    };
  });
  return <Animated.View style={[screenS.dot, anim]} />;
}

function PageDots({ pageIndicator, visible }: { pageIndicator: Animated.SharedValue<number>; visible: boolean }) {
  const op = useSharedValue(1);
  useEffect(() => {
    op.value = withTiming(visible ? 1 : 0, { duration: 350, easing: Easing.inOut(Easing.ease) });
  }, [visible, op]);
  const s = useAnimatedStyle(() => ({
    opacity: op.value,
    transform: [{ translateY: interpolate(op.value, [1, 0], [0, 20]) }],
  }));
  return (
    <Animated.View style={[screenS.dotsRow, s]}>
      {PAGE_META.map((_, i) => <Dot key={i} index={i} pageIndicator={pageIndicator} />)}
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Main Screen — fade transitions + swipe gestures
// ---------------------------------------------------------------------------

export default function OnboardingScreen() {
  const { width } = useWindowDimensions();
  const [lang, setLang] = useState<string | null>(null);
  const [step, setStep] = useState(0); // 0..5 (0-4 tutorial, 5 play)
  const [expanding, setExpanding] = useState(false);

  const isPlayPage = step >= TOTAL_TUTORIAL;
  const pageIndicator = useSharedValue(0);

  useEffect(() => {
    pageIndicator.value = withSpring(step, { damping: 20, stiffness: 200 });
  }, [step, pageIndicator]);

  // Swipe gesture
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 20 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderRelease: (_, g) => {
        if (g.dx < -50 && step < TOTAL_TUTORIAL) {
          hapticSelection();
          setStep(s => Math.min(s + 1, TOTAL_TUTORIAL));
        } else if (g.dx > 50 && step > 0) {
          hapticSelection();
          setStep(s => Math.max(s - 1, 0));
        }
      },
    }),
  ).current;

  const handleComplete = useCallback(async () => {
    hapticProcessingDone();
    if (lang) await AsyncStorage.setItem(LANGUAGE_KEY, lang);
    await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
    router.replace('/(auth)/login');
  }, [lang]);

  const handlePlay = useCallback(() => {
    hapticButtonPress();
    setExpanding(true);
  }, []);

  const onTransitionDone = useCallback(() => { handleComplete(); }, [handleComplete]);

  const handleLangSelect = useCallback(async (code: string) => {
    await AsyncStorage.setItem(LANGUAGE_KEY, code);
    setLang(code);
  }, []);

  if (!lang) return <LanguagePicker onSelect={handleLangSelect} />;

  const t = TX[lang] ?? TX.es;

  return (
    <View style={screenS.root}>
      <SafeAreaView style={screenS.safe}>
        {/* Top: skip */}
        <View style={screenS.topBar}>
          <View style={{ flex: 1 }} />
          {!isPlayPage && (
            <Animated.View entering={FadeIn.duration(400)} key="skip">
              <AnimatedPressable onPress={handleComplete} style={screenS.skipBtn}>
                <Text style={screenS.skipText}>{t.skip}</Text>
              </AnimatedPressable>
            </Animated.View>
          )}
        </View>

        {/* Content area with swipe */}
        <View style={screenS.content} {...panResponder.panHandlers}>
          {isPlayPage ? (
            <Animated.View key="play" entering={FadeIn.duration(500)} exiting={FadeOut.duration(300)} style={screenS.center}>
              <PlayButton onPress={handlePlay} />
            </Animated.View>
          ) : (
            <Animated.View key={`page-${step}`} entering={FadeIn.duration(450)} exiting={FadeOut.duration(250)} style={screenS.center}>
              <View style={pageS.illustrationArea}>
                <PageIllustration icon={PAGE_META[step].icon} iconBg={PAGE_META[step].iconBg} anim={PAGE_META[step].anim} />
              </View>
              <View style={pageS.cardWrap}>
                <View style={pageS.cardInner}>
                  <Text style={pageS.title}>{t.pages[step].title}</Text>
                  <Text style={pageS.subtitle}>{t.pages[step].subtitle}</Text>
                </View>
              </View>
            </Animated.View>
          )}
        </View>

        {/* Dots */}
        <PageDots pageIndicator={pageIndicator} visible={!isPlayPage} />
        <View style={{ height: 28 }} />
      </SafeAreaView>

      <TransitionOverlay expanding={expanding} onDone={onTransitionDone} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const pageS = StyleSheet.create({
  illustrationArea: { marginBottom: 44, alignItems: 'center', justifyContent: 'center' },
  cardWrap: {
    borderRadius: 28, overflow: 'hidden', width: '100%',
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)',
    backgroundColor: 'rgba(0,0,0,0.02)',
  },
  cardInner: { padding: 32, alignItems: 'center' },
  title: {
    fontSize: 36, fontFamily: FONT.bold, color: '#111111', textAlign: 'center',
    letterSpacing: -1, lineHeight: 44, marginBottom: 16,
  },
  subtitle: {
    fontSize: 16, fontFamily: FONT.regular, color: '#777777',
    textAlign: 'center', lineHeight: 24, maxWidth: 300,
  },
});

const screenS = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFFFFF' },
  safe: { flex: 1 },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 12 },
  skipBtn: {
    paddingHorizontal: 18, paddingVertical: 10, borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.04)', borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)',
  },
  skipText: { fontSize: 14, fontFamily: FONT.medium, color: '#999999' },
  content: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 28 },
  center: { width: '100%', alignItems: 'center' },
  dotsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 16 },
  dot: { height: 8, borderRadius: 4 },
});
