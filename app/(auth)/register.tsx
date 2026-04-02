import { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
  FadeInDown,
  FadeIn,
} from 'react-native-reanimated';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Linking from 'expo-linking';
import { COLORS } from '@/lib/constants';
import { shadows } from '@/lib/styles';
import { validateEmail, validatePassword } from '@/lib/validation';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/lib/supabase';
import { showToast } from '@/components/Toast';
import FloatingOrb from '@/components/FloatingOrb';
import AnimatedPressable from '@/components/AnimatedPressable';

export default function RegisterScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const { register, resendConfirmation, loading, error, clearError } = useAuthStore();
  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);

  /* ── shake animation for error ──────────────────────── */
  const shakeX = useSharedValue(0);

  useEffect(() => {
    if (error) {
      shakeX.value = withSequence(
        withTiming(-10, { duration: 50 }),
        withTiming(10, { duration: 50 }),
        withTiming(-5, { duration: 50 }),
        withTiming(0, { duration: 50 }),
      );
    }
  }, [error, shakeX]);

  const shakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shakeX.value }],
  }));

  /* ── handlers ───────────────────────────────────────── */
  const handleRegister = async () => {
    const emailCheck = validateEmail(email);
    if (!emailCheck.valid) {
      Alert.alert('Error', emailCheck.message);
      return;
    }
    const passwordCheck = validatePassword(password);
    if (!passwordCheck.valid) {
      Alert.alert('Error', passwordCheck.message);
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('Error', 'Las contraseñas no coinciden.');
      return;
    }
    clearError();
    const result = await register(email.trim(), password);
    if (result === 'confirm_email') {
      Alert.alert(
        'Revisa tu correo',
        'Te enviamos un enlace de confirmación. Abre tu email y confirma tu cuenta para iniciar sesión.',
        [
          {
            text: 'Reenviar correo',
            onPress: async () => {
              const ok = await resendConfirmation(email.trim());
              if (ok) {
                Alert.alert('Correo reenviado', 'Revisa tu bandeja de entrada y spam.');
              } else {
                Alert.alert('Error', 'No se pudo reenviar. Intenta en unos minutos.');
              }
            },
          },
          { text: 'Ir a iniciar sesión', onPress: () => router.replace('/(auth)/login') },
        ],
      );
    }
  };

  return (
    <SafeAreaView style={styles.bg}>

        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.inner}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          automaticallyAdjustKeyboardInsets
          showsVerticalScrollIndicator={false}
        >
          {/* Title */}
          <Animated.Text
            entering={FadeInDown.springify().damping(14)}
            style={styles.title}
          >
            Sythio
          </Animated.Text>

          <Animated.Text
            entering={FadeInDown.delay(200).springify().damping(14)}
            style={styles.subtitle}
          >
            Crea tu cuenta
          </Animated.Text>

          {/* Error */}
          {error ? (
            <Animated.View style={[styles.errorContainer, shakeStyle]}>
              <Text style={styles.error}>{error}</Text>
            </Animated.View>
          ) : null}

          {/* Email input */}
          <View style={styles.inputContainer}>
            <Ionicons name="mail-outline" size={20} color={COLORS.textMuted} />
            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor={COLORS.textMuted}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="emailAddress"
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
              blurOnSubmit={false}
              value={email}
              onChangeText={setEmail}
            />
          </View>

          {/* Password input */}
          <View style={styles.inputContainer}>
            <Ionicons name="lock-closed-outline" size={20} color={COLORS.textMuted} />
            <TextInput
              ref={passwordRef}
              style={styles.input}
              placeholder="Contraseña (mín. 8 caracteres)"
              placeholderTextColor={COLORS.textMuted}
              secureTextEntry
              textContentType="newPassword"
              returnKeyType="next"
              onSubmitEditing={() => confirmRef.current?.focus()}
              blurOnSubmit={false}
              value={password}
              onChangeText={setPassword}
            />
          </View>

          {/* Confirm password input */}
          <View style={styles.inputContainer}>
            <Ionicons name="shield-checkmark-outline" size={20} color={COLORS.textMuted} />
            <TextInput
              ref={confirmRef}
              style={styles.input}
              placeholder="Confirmar contraseña"
              placeholderTextColor={COLORS.textMuted}
              secureTextEntry
              textContentType="newPassword"
              returnKeyType="go"
              onSubmitEditing={handleRegister}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
            />
          </View>

          {/* Terms */}
          <Text style={styles.termsText}>
            Al crear tu cuenta, aceptas los{' '}
            <Text style={styles.termsLink} onPress={() => Linking.openURL('https://sythio.com/terms')}>Términos de Servicio</Text>
            {' '}y la{' '}
            <Text style={styles.termsLink} onPress={() => Linking.openURL('https://sythio.com/privacy-policy')}>Política de Privacidad</Text>.
          </Text>

          {/* Register button */}
          <AnimatedPressable
            onPress={handleRegister}
            disabled={loading}
            style={[styles.buttonOuter, loading && styles.buttonDisabled]}
            scaleDown={0.96}
            accessibilityLabel="Crear cuenta"
          >
            <LinearGradient
              colors={[COLORS.primary, COLORS.primaryDark]}
              style={styles.button}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              {loading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.buttonText}>Crear cuenta</Text>
              )}
            </LinearGradient>
          </AnimatedPressable>

          {/* Social login */}
          <Animated.View entering={FadeIn.delay(750)} style={styles.socialSection}>
            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>o regístrate con</Text>
              <View style={styles.dividerLine} />
            </View>
            <View style={styles.socialRow}>
              <TouchableOpacity
                style={styles.socialBtn}
                activeOpacity={0.7}
                onPress={async () => {
                  const redirectUrl = Linking.createURL('/(tabs)');
                  const { error } = await supabase.auth.signInWithOAuth({
                    provider: 'google',
                    options: { redirectTo: redirectUrl },
                  });
                  if (error) showToast('Error con Google: ' + error.message, 'error');
                }}
              >
                <Ionicons name="logo-google" size={20} color="#DB4437" />
                <Text style={styles.socialBtnText}>Google</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.socialBtn}
                activeOpacity={0.7}
                onPress={async () => {
                  const redirectUrl = Linking.createURL('/(tabs)');
                  const { error } = await supabase.auth.signInWithOAuth({
                    provider: 'apple',
                    options: { redirectTo: redirectUrl },
                  });
                  if (error) showToast('Error con Apple: ' + error.message, 'error');
                }}
              >
                <Ionicons name="logo-apple" size={20} color={COLORS.textPrimary} />
                <Text style={styles.socialBtnText}>Apple</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>

          {/* Link */}
          <Animated.View entering={FadeIn.delay(800)}>
            <TouchableOpacity
              style={styles.linkButton}
              onPress={() => router.push('/(auth)/login')}
              activeOpacity={0.7}
            >
              <Text style={styles.linkText}>
                ¿Ya tienes cuenta?{' '}
                <Text style={styles.linkBold}>Inicia sesión</Text>
              </Text>
            </TouchableOpacity>
          </Animated.View>
        </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  bg: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  container: {
    flex: 1,
  },
  inner: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingVertical: 24,
  },
  title: {
    fontSize: 36,
    fontWeight: '800',
    color: COLORS.primary,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 40,
  },
  errorContainer: {
    marginBottom: 16,
  },
  error: {
    color: COLORS.error,
    fontSize: 14,
    textAlign: 'center',
    backgroundColor: '#FEE2E2',
    padding: 12,
    borderRadius: 12,
    overflow: 'hidden',
  },
  inputContainer: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    height: 58,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: COLORS.textPrimary,
    height: '100%',
  },
  buttonOuter: {
    marginTop: 32,
    ...shadows.brand,
  },
  button: {
    height: 58,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  linkButton: {
    marginTop: 20,
    alignItems: 'center',
  },
  linkText: {
    color: COLORS.textSecondary,
    fontSize: 14,
  },
  linkBold: {
    color: COLORS.primary,
    fontWeight: '600',
  },
  termsText: {
    fontSize: 12,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 17,
    marginBottom: 8,
    paddingHorizontal: 8,
  },
  termsLink: {
    color: COLORS.textSecondary,
    textDecorationLine: 'underline' as const,
  },
  // Social login
  socialSection: {
    marginTop: 24,
    gap: 16,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.border,
  },
  dividerText: {
    fontSize: 13,
    color: COLORS.textMuted,
  },
  socialRow: {
    flexDirection: 'row',
    gap: 12,
  },
  socialBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 50,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  socialBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
});
