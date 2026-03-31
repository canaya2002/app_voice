import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  Image,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Animated, {
  FadeIn,
  FadeOut,
  FadeInDown,
  FadeInUp,
  FadeInRight,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { hapticButtonPress, hapticProcessingDone, hapticSelection } from '@/lib/haptics';

const { width: SW, height: SH } = Dimensions.get('window');
const WELCOME_KEY = 'sythio_welcome_done';

type Step = 'language' | 'greeting' | 'name' | 'vocab' | 'photo' | 'done';
interface ChatMsg { id: string; text: string; from: 'sythio' | 'user'; delay: number }

// ── Star particle (constellation background) ──

function Star({ x, y, size, delay }: { x: number; y: number; size: number; delay: number }) {
  const opacity = useSharedValue(0);
  useEffect(() => {
    opacity.value = withDelay(delay, withRepeat(
      withSequence(
        withTiming(0.7, { duration: 1500 + Math.random() * 2000, easing: Easing.inOut(Easing.sin) }),
        withTiming(0.15, { duration: 1500 + Math.random() * 2000, easing: Easing.inOut(Easing.sin) }),
      ), -1, true,
    ));
  }, [opacity, delay]);
  const anim = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={[{ position: 'absolute', left: x, top: y, width: size, height: size, borderRadius: size / 2, backgroundColor: '#8FD3FF' }, anim]} />;
}

function ConstellationBg() {
  const stars = useMemo(() => {
    const arr: { x: number; y: number; size: number; delay: number }[] = [];
    for (let i = 0; i < 35; i++) {
      arr.push({
        x: Math.random() * SW,
        y: Math.random() * SH,
        size: 2 + Math.random() * 3,
        delay: Math.random() * 3000,
      });
    }
    return arr;
  }, []);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {stars.map((s, i) => <Star key={i} x={s.x} y={s.y} size={s.size} delay={s.delay} />)}
    </View>
  );
}

// ── Typing dots ──

function TypingDots() {
  return (
    <Animated.View entering={FadeIn.duration(250)} exiting={FadeOut.duration(150)} style={st.sythioBubble}>
      <View style={st.dotsRow}>
        {[0, 150, 300].map((d) => (
          <Animated.View key={d} entering={FadeIn.delay(d).duration(350)} style={st.dot} />
        ))}
      </View>
    </Animated.View>
  );
}

// ── Bubble ──

function Bubble({ text, from }: { text: string; from: 'sythio' | 'user' }) {
  const isSythio = from === 'sythio';
  return (
    <Animated.View entering={isSythio ? FadeInDown.duration(350) : FadeInRight.duration(300)} style={isSythio ? st.sythioBubble : st.userBubble}>
      <Text style={isSythio ? st.sythioText : st.userText}>{text}</Text>
    </Animated.View>
  );
}

// ── Languages ──

const LANGUAGES = [
  { code: 'es', label: 'Español', flag: '🇪🇸' },
  { code: 'en', label: 'English', flag: '🇺🇸' },
  { code: 'pt', label: 'Português', flag: '🇧🇷' },
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
  { code: 'it', label: 'Italiano', flag: '🇮🇹' },
];

// ── i18n ──

const T: Record<string, Record<string, string>> = {
  es: { gm: 'Buenos días', ga: 'Buenas tardes', gn: 'Buenas noches', intro: 'Soy Sythio. Transformo tu voz en claridad — resúmenes, tareas, reportes y más.', askName: '¿Cómo te llamas?', ph: 'Tu nombre', cont: 'Continuar', skip: 'Saltar', nice: 'Encantado, {n}.', askV: '¿Hay términos que uses seguido? Nombres, proyectos, tecnicismos...', phV: 'Escribe un término y presiona Enter', askP: '¿Quieres agregar una foto de perfil?', pick: 'Elegir foto', change: 'Cambiar', done: 'Todo listo, {n}. Graba tu primera nota cuando quieras.', start: 'Empezar', saving: 'Preparando...' },
  en: { gm: 'Good morning', ga: 'Good afternoon', gn: 'Good evening', intro: "I'm Sythio. I turn your voice into clarity — summaries, tasks, reports and more.", askName: "What's your name?", ph: 'Your name', cont: 'Continue', skip: 'Skip', nice: 'Nice to meet you, {n}.', askV: 'Any terms you use often? Names, projects, jargon...', phV: 'Type a term and press Enter', askP: 'Want to add a profile photo?', pick: 'Choose photo', change: 'Change', done: "All set, {n}. Record your first note whenever you're ready.", start: 'Start', saving: 'Getting ready...' },
  pt: { gm: 'Bom dia', ga: 'Boa tarde', gn: 'Boa noite', intro: 'Sou o Sythio. Transformo sua voz em clareza — resumos, tarefas, relatórios e mais.', askName: 'Como você se chama?', ph: 'Seu nome', cont: 'Continuar', skip: 'Pular', nice: 'Prazer, {n}.', askV: 'Há termos que você usa com frequência?', phV: 'Digite um termo e pressione Enter', askP: 'Quer adicionar uma foto de perfil?', pick: 'Escolher foto', change: 'Mudar', done: 'Tudo pronto, {n}. Grave sua primeira nota quando quiser.', start: 'Começar', saving: 'Preparando...' },
  fr: { gm: 'Bonjour', ga: 'Bon après-midi', gn: 'Bonsoir', intro: "Je suis Sythio. Je transforme votre voix en clarté — résumés, tâches, rapports et plus.", askName: 'Comment vous appelez-vous?', ph: 'Votre nom', cont: 'Continuer', skip: 'Passer', nice: 'Enchanté, {n}.', askV: 'Des termes que vous utilisez souvent?', phV: 'Tapez un terme et appuyez sur Entrée', askP: 'Ajouter une photo de profil?', pick: 'Choisir photo', change: 'Changer', done: 'Tout est prêt, {n}. Enregistrez votre première note.', start: 'Commencer', saving: 'Préparation...' },
  it: { gm: 'Buongiorno', ga: 'Buon pomeriggio', gn: 'Buonasera', intro: "Sono Sythio. Trasformo la tua voce in chiarezza — riassunti, attività, report e altro.", askName: 'Come ti chiami?', ph: 'Il tuo nome', cont: 'Continua', skip: 'Salta', nice: 'Piacere, {n}.', askV: 'Ci sono termini che usi spesso? Nomi, progetti, tecnicismi...', phV: 'Scrivi un termine e premi Invio', askP: 'Vuoi aggiungere una foto profilo?', pick: 'Scegli foto', change: 'Cambia', done: 'Tutto pronto, {n}. Registra la tua prima nota quando vuoi.', start: 'Iniziamo', saving: 'Preparazione...' },
};

// ── Main ──

export default function WelcomeScreen() {
  const { user, fetchProfile } = useAuthStore();
  const [step, setStep] = useState<Step>('language');
  const [lang, setLang] = useState('en');
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [typing, setTyping] = useState(false);
  const [name, setName] = useState('');
  const [vocab, setVocab] = useState<string[]>([]);
  const [vocabInput, setVocabInput] = useState('');
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [selectedLang, setSelectedLang] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const t = T[lang] ?? T.es;
  const hour = new Date().getHours();
  const gKey = hour < 12 ? 'gm' : hour < 19 ? 'ga' : 'gn';

  const addUser = useCallback((id: string, text: string) => {
    setMsgs(p => [...p, { id, text, from: 'user', delay: 0 }]);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
  }, []);

  const showSythio = useCallback((list: ChatMsg[], onDone?: () => void) => {
    let i = 0;
    const next = () => {
      if (i >= list.length) { setTyping(false); onDone?.(); return; }
      const cur = list[i];
      setTyping(true);
      setTimeout(() => {
        setTyping(false);
        setMsgs(p => [...p, cur]);
        setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
        i++;
        setTimeout(next, 250);
      }, cur.delay);
    };
    next();
  }, []);

  const selectLanguage = (code: string) => {
    hapticSelection();
    setSelectedLang(code);
    setLang(code);
    // Delay to show selection before transitioning
    setTimeout(() => {
      setStep('greeting');
      const s = T[code] ?? T.es;
      const g = hour < 12 ? 'gm' : hour < 19 ? 'ga' : 'gn';
      showSythio([
        { id: 'g1', text: `${s[g]} 👋`, from: 'sythio', delay: 500 },
        { id: 'g2', text: s.intro, from: 'sythio', delay: 900 },
        { id: 'g3', text: s.askName, from: 'sythio', delay: 700 },
      ]);
    }, 400);
  };

  const submitName = () => {
    if (name.trim().length < 2) return;
    hapticButtonPress();
    addUser('u_name', name.trim());
    setStep('vocab');
    setTimeout(() => showSythio([
      { id: 'n1', text: t.nice.replace('{n}', name.trim()), from: 'sythio', delay: 400 },
      { id: 'n2', text: t.askV, from: 'sythio', delay: 800 },
    ]), 350);
  };

  const addVocab = () => {
    const w = vocabInput.trim();
    if (!w || vocab.includes(w)) return;
    hapticSelection();
    setVocab(p => [...p, w]);
    setVocabInput('');
  };

  const submitVocab = () => {
    hapticButtonPress();
    if (vocab.length > 0) addUser('u_vocab', vocab.join(', '));
    setStep('photo');
    setTimeout(() => showSythio([
      { id: 'p1', text: t.askP, from: 'sythio', delay: 400 },
    ]), 250);
  };

  const pickPhoto = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8 });
    if (!r.canceled && r.assets[0]) { hapticSelection(); setAvatarUri(r.assets[0].uri); }
  };

  const goDone = () => {
    setStep('done');
    showSythio([{ id: 'd1', text: t.done.replace('{n}', name.trim()), from: 'sythio', delay: 400 }]);
  };

  const finish = async () => {
    setSaving(true);
    hapticProcessingDone();
    // Set local flag FIRST — this prevents the navigation loop
    await AsyncStorage.setItem(WELCOME_KEY, 'true');
    let avatarUrl: string | undefined;
    if (avatarUri && user) {
      try {
        const ext = avatarUri.split('.').pop() ?? 'jpg';
        const path = `${user.id}/avatar.${ext}`;
        const res = await fetch(avatarUri);
        const blob = await res.blob();
        await supabase.storage.from('profiles').upload(path, blob, { upsert: true });
        const { data } = supabase.storage.from('profiles').getPublicUrl(path);
        avatarUrl = data.publicUrl;
      } catch { /* skip */ }
    }
    if (user) {
      await supabase.from('profiles').update({
        display_name: name.trim(), custom_vocabulary: vocab.length > 0 ? vocab : [],
        avatar_url: avatarUrl ?? null, welcome_completed: true,
      }).eq('id', user.id);
    }
    await fetchProfile();
    router.replace('/(tabs)');
  };

  const has = (id: string) => msgs.some(m => m.id === id) && !typing;

  // Logo pulse
  const logoScale = useSharedValue(1);
  useEffect(() => {
    logoScale.value = withRepeat(withSequence(
      withTiming(1.04, { duration: 2000, easing: Easing.inOut(Easing.sin) }),
      withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.sin) }),
    ), -1, true);
  }, [logoScale]);
  const logoAnim = useAnimatedStyle(() => ({ transform: [{ scale: logoScale.value }] }));

  return (
    <View style={st.root}>
      <ConstellationBg />
      <SafeAreaView style={st.safe}>
        <KeyboardAvoidingView style={st.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView ref={scrollRef} style={st.flex} contentContainerStyle={st.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

            {/* Logo with gentle pulse */}
            <Animated.View entering={FadeIn.duration(800)} style={st.logoArea}>
              <Animated.View style={logoAnim}>
                <Image source={require('@/assets/images/icon.png')} style={st.logoImg} />
              </Animated.View>
            </Animated.View>

            {/* Step: Language */}
            {step === 'language' && (
              <Animated.View entering={FadeInDown.duration(500).delay(300)} style={st.langSection}>
                <Text style={st.langTitle}>Choose your language</Text>
                <Text style={st.langSub}>You can change this later</Text>
                <View style={st.langGrid}>
                  {LANGUAGES.map((l, i) => (
                    <Animated.View key={l.code} entering={FadeInUp.duration(400).delay(400 + i * 80)}>
                      <TouchableOpacity
                        onPress={() => selectLanguage(l.code)}
                        style={[st.langBtn, selectedLang === l.code && st.langBtnActive]}
                        activeOpacity={0.7}
                      >
                        <Text style={st.langFlag}>{l.flag}</Text>
                        <Text style={[st.langLabel, selectedLang === l.code && st.langLabelActive]}>{l.label}</Text>
                        {selectedLang === l.code && <Ionicons name="checkmark-circle" size={20} color="#8FD3FF" style={{ marginLeft: 'auto' }} />}
                      </TouchableOpacity>
                    </Animated.View>
                  ))}
                </View>
              </Animated.View>
            )}

            {/* Chat */}
            {step !== 'language' && msgs.map(m => <Bubble key={m.id} text={m.text} from={m.from} />)}
            {typing && <TypingDots />}

            {/* Name */}
            {step === 'greeting' && has('g3') && (
              <Animated.View entering={FadeInUp.duration(400)} style={st.inputArea}>
                <TextInput style={st.input} placeholder={t.ph} placeholderTextColor="#B8BCC4" value={name} onChangeText={setName} autoFocus returnKeyType="done" onSubmitEditing={submitName} maxLength={30} />
                {name.trim().length >= 2 && (
                  <Animated.View entering={FadeInUp.duration(300)}>
                    <TouchableOpacity onPress={submitName} style={st.btn} activeOpacity={0.8}>
                      <Text style={st.btnText}>{t.cont}</Text>
                      <Ionicons name="arrow-forward" size={18} color="#FFF" />
                    </TouchableOpacity>
                  </Animated.View>
                )}
              </Animated.View>
            )}

            {/* Vocab */}
            {step === 'vocab' && has('n2') && (
              <Animated.View entering={FadeInUp.duration(400)} style={st.inputArea}>
                {vocab.length > 0 && (
                  <Animated.View entering={FadeIn.duration(200)} style={st.chipRow}>
                    {vocab.map(w => (
                      <Animated.View key={w} entering={FadeIn.duration(200)} style={st.chip}>
                        <Text style={st.chipText}>{w}</Text>
                        <TouchableOpacity onPress={() => setVocab(p => p.filter(x => x !== w))} hitSlop={8}>
                          <Ionicons name="close" size={14} color="#8A8F98" />
                        </TouchableOpacity>
                      </Animated.View>
                    ))}
                  </Animated.View>
                )}
                <TextInput style={st.input} placeholder={t.phV} placeholderTextColor="#B8BCC4" value={vocabInput} onChangeText={setVocabInput} returnKeyType="done" onSubmitEditing={addVocab} autoFocus />
                <TouchableOpacity onPress={submitVocab} style={st.btn} activeOpacity={0.8}>
                  <Text style={st.btnText}>{vocab.length > 0 ? t.cont : t.skip}</Text>
                  <Ionicons name="arrow-forward" size={18} color="#FFF" />
                </TouchableOpacity>
              </Animated.View>
            )}

            {/* Photo */}
            {step === 'photo' && has('p1') && (
              <Animated.View entering={FadeInUp.duration(400)} style={st.inputArea}>
                {avatarUri && (
                  <Animated.View entering={FadeIn.duration(350)} style={st.avatarWrap}>
                    <Animated.Image source={{ uri: avatarUri }} style={st.avatarImg} />
                  </Animated.View>
                )}
                <View style={st.row}>
                  <TouchableOpacity onPress={pickPhoto} style={st.btn2} activeOpacity={0.8}>
                    <Ionicons name="image-outline" size={18} color="#0B0B0B" />
                    <Text style={st.btn2Text}>{avatarUri ? t.change : t.pick}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={goDone} style={[st.btn, { flex: 1 }]} activeOpacity={0.8}>
                    <Text style={st.btnText}>{avatarUri ? t.cont : t.skip}</Text>
                  </TouchableOpacity>
                </View>
              </Animated.View>
            )}

            {/* Done */}
            {step === 'done' && has('d1') && (
              <Animated.View entering={FadeInUp.duration(500)} style={st.inputArea}>
                <TouchableOpacity onPress={finish} disabled={saving} style={st.finishWrap} activeOpacity={0.85}>
                  <LinearGradient colors={['#0B0B0B', '#1A1A1A']} style={st.finishGrad}>
                    <Text style={st.finishText}>{saving ? t.saving : t.start}</Text>
                    {!saving && <Ionicons name="arrow-forward" size={20} color="#FFF" />}
                  </LinearGradient>
                </TouchableOpacity>
              </Animated.View>
            )}

            <View style={{ height: 80 }} />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFFFFF' },
  safe: { flex: 1 },
  flex: { flex: 1 },
  scroll: { padding: 24, paddingTop: 50 },

  logoArea: { alignItems: 'center', marginBottom: 36 },
  logoImg: { width: 64, height: 64, borderRadius: 16 },

  langSection: { gap: 10 },
  langTitle: { fontSize: 22, fontWeight: '700', color: '#0B0B0B', textAlign: 'center' },
  langSub: { fontSize: 14, color: '#B8BCC4', textAlign: 'center', marginBottom: 8 },
  langGrid: { gap: 8 },
  langBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#F5F7FA', borderRadius: 14, padding: 16,
    borderWidth: 1.5, borderColor: '#EBEDF0',
  },
  langBtnActive: { borderColor: '#8FD3FF', backgroundColor: '#F0F9FF' },
  langFlag: { fontSize: 24 },
  langLabel: { fontSize: 16, fontWeight: '500', color: '#0B0B0B' },
  langLabelActive: { fontWeight: '600' },

  sythioBubble: {
    backgroundColor: '#F5F7FA', borderRadius: 18, borderTopLeftRadius: 4,
    padding: 14, paddingHorizontal: 18, marginBottom: 8,
    maxWidth: '82%', alignSelf: 'flex-start',
  },
  sythioText: { fontSize: 16, lineHeight: 24, color: '#0B0B0B' },
  userBubble: {
    backgroundColor: '#0B0B0B', borderRadius: 18, borderTopRightRadius: 4,
    padding: 14, paddingHorizontal: 18, marginBottom: 8,
    maxWidth: '75%', alignSelf: 'flex-end',
  },
  userText: { fontSize: 16, lineHeight: 24, color: '#FFFFFF' },

  dotsRow: { flexDirection: 'row', gap: 6, paddingVertical: 4 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#B8BCC4' },

  inputArea: { marginTop: 14, gap: 12 },
  input: {
    backgroundColor: '#F5F7FA', borderRadius: 14, padding: 16, paddingHorizontal: 20,
    fontSize: 17, color: '#0B0B0B', borderWidth: 1.5, borderColor: '#EBEDF0',
  },
  btn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#0B0B0B', borderRadius: 14, paddingVertical: 16,
  },
  btnText: { color: '#FFF', fontSize: 16, fontWeight: '600' },
  btn2: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#F5F7FA', borderRadius: 14, paddingVertical: 16, borderWidth: 1, borderColor: '#EBEDF0',
  },
  btn2Text: { color: '#0B0B0B', fontSize: 15, fontWeight: '500' },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#E8F4FD', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
  },
  chipText: { color: '#0B0B0B', fontSize: 14, fontWeight: '500' },

  row: { flexDirection: 'row', gap: 10 },
  avatarWrap: { alignItems: 'center', marginBottom: 8 },
  avatarImg: { width: 80, height: 80, borderRadius: 40, borderWidth: 2, borderColor: '#EBEDF0' },

  finishWrap: { borderRadius: 16, overflow: 'hidden' },
  finishGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 18 },
  finishText: { color: '#FFF', fontSize: 17, fontWeight: '700' },
});
