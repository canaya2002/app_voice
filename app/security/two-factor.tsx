/**
 * Two-Factor Authentication enrollment + management screen.
 *
 * Three states:
 *   1. INTRO    — explain 2FA + activate button (when no factor exists)
 *   2. ENROLL   — show QR + secret + TOTP input + backup codes after verify
 *   3. ACTIVE   — show "2FA active" + disable button (with TOTP confirmation)
 */

import { useEffect, useMemo, useState } from 'react';
import { ScrollView, View, StyleSheet, Pressable, Platform } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut } from 'react-native-reanimated';
import { Stack, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { Surface } from '@/components/primitives/Surface';
import { Text } from '@/components/primitives/Text';
import { Button } from '@/components/primitives/Button';
import { TOTPInput } from '@/components/security/TOTPInput';
import { QRDisplay } from '@/components/security/QRDisplay';
import { BackupCodesList } from '@/components/security/BackupCodesList';
import { useTheme } from '@/lib/design/tokens';
import { showToast } from '@/components/Toast';
import * as Haptics from 'expo-haptics';

type Stage = 'loading' | 'intro' | 'enroll' | 'verify_disable' | 'active';

interface EnrollmentData {
  factorId: string;
  qr: string;
  secret: string;
}

// Backup codes are generated client-side after a successful enrollment.
function generateBackupCodes(count = 8): string[] {
  const codes: string[] = [];
  const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // ambiguous chars omitted
  for (let i = 0; i < count; i++) {
    let code = '';
    for (let j = 0; j < 10; j++) {
      code += charset[Math.floor(Math.random() * charset.length)];
      if (j === 4) code += '-';
    }
    codes.push(code);
  }
  return codes;
}

export default function TwoFactorScreen() {
  const t = useTheme();
  const [stage, setStage] = useState<Stage>('loading');
  const [enrollment, setEnrollment] = useState<EnrollmentData | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [activeFactorId, setActiveFactorId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase.auth.mfa.listFactors();
        if (error) throw error;
        const verified = data?.totp?.find((f) => f.status === 'verified');
        if (verified) {
          setActiveFactorId(verified.id);
          setStage('active');
        } else {
          setStage('intro');
        }
      } catch (err) {
        console.warn('[2fa] listFactors error:', err);
        setStage('intro');
      }
    })();
  }, []);

  const startEnrollment = async () => {
    setBusy(true);
    try {
      // Drop any unverified pending factors first to avoid the "already enrolled" error.
      const list = await supabase.auth.mfa.listFactors();
      const pending = list.data?.totp?.filter((f) => f.status !== 'verified') ?? [];
      for (const p of pending) {
        await supabase.auth.mfa.unenroll({ factorId: p.id });
      }

      const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' });
      if (error || !data) throw error ?? new Error('No se pudo iniciar el enrollment');
      setEnrollment({
        factorId: data.id,
        qr: data.totp.qr_code,
        secret: data.totp.secret,
      });
      setStage('enroll');
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
    } catch (err: any) {
      console.warn('[2fa] enroll error:', err);
      showToast(err?.message ?? 'No se pudo iniciar 2FA', 'error');
    } finally {
      setBusy(false);
    }
  };

  const verifyEnrollment = async (incoming: string) => {
    const finalCode = incoming ?? code;
    if (!enrollment || finalCode.length !== 6) return;
    setBusy(true);
    try {
      const challenge = await supabase.auth.mfa.challenge({ factorId: enrollment.factorId });
      if (challenge.error) throw challenge.error;
      const verify = await supabase.auth.mfa.verify({
        factorId: enrollment.factorId,
        challengeId: challenge.data.id,
        code: finalCode,
      });
      if (verify.error) throw verify.error;
      const codes = generateBackupCodes();
      setBackupCodes(codes);
      setActiveFactorId(enrollment.factorId);
      setStage('active');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      showToast('2FA activada correctamente', 'success');
    } catch (err: any) {
      console.warn('[2fa] verify error:', err);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
      showToast(err?.message ?? 'Código incorrecto', 'error');
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  const beginDisable = () => {
    setCode('');
    setStage('verify_disable');
  };

  const confirmDisable = async (incoming: string) => {
    const finalCode = incoming ?? code;
    if (!activeFactorId || finalCode.length !== 6) return;
    setBusy(true);
    try {
      const challenge = await supabase.auth.mfa.challenge({ factorId: activeFactorId });
      if (challenge.error) throw challenge.error;
      const verify = await supabase.auth.mfa.verify({
        factorId: activeFactorId,
        challengeId: challenge.data.id,
        code: finalCode,
      });
      if (verify.error) throw verify.error;
      const unenroll = await supabase.auth.mfa.unenroll({ factorId: activeFactorId });
      if (unenroll.error) throw unenroll.error;
      setActiveFactorId(null);
      setBackupCodes([]);
      setEnrollment(null);
      setStage('intro');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      showToast('2FA desactivada', 'success');
    } catch (err: any) {
      console.warn('[2fa] disable error:', err);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
      showToast(err?.message ?? 'Código incorrecto', 'error');
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg.primary }}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.header, { borderBottomColor: t.border.subtle }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={26} color={t.text.primary} />
        </Pressable>
        <Text variant="subtitle">Verificación en 2 pasos</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {stage === 'loading' && (
          <View style={{ paddingVertical: 80, alignItems: 'center' }}>
            <Text variant="callout" tone="tertiary">Cargando…</Text>
          </View>
        )}

        {stage === 'intro' && <IntroState busy={busy} onStart={startEnrollment} />}

        {stage === 'enroll' && enrollment && (
          <EnrollState
            enrollment={enrollment}
            code={code}
            onChangeCode={setCode}
            onVerify={verifyEnrollment}
            busy={busy}
          />
        )}

        {stage === 'active' && (
          <ActiveState
            backupCodes={backupCodes}
            onDisable={beginDisable}
            justEnrolled={backupCodes.length > 0}
          />
        )}

        {stage === 'verify_disable' && (
          <VerifyDisableState
            code={code}
            onChangeCode={setCode}
            onConfirm={confirmDisable}
            onCancel={() => setStage('active')}
            busy={busy}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Stage components ───────────────────────────────────────────────────────

function IntroState({ busy, onStart }: { busy: boolean; onStart: () => void }) {
  const t = useTheme();
  const benefits = [
    { icon: 'shield-checkmark' as const, title: 'Capa adicional de protección', desc: 'Aunque alguien obtenga tu contraseña, no podrá acceder sin tu código.' },
    { icon: 'phone-portrait' as const, title: 'Funciona offline', desc: 'Genera códigos sin internet desde tu app de autenticación.' },
    { icon: 'time' as const, title: '60 segundos', desc: 'Lo activas en menos de un minuto.' },
  ];
  return (
    <Animated.View entering={FadeInDown.duration(360)}>
      <View style={styles.heroIcon}>
        <View style={[styles.heroIconCircle, { backgroundColor: t.accentSubtle }]}>
          <Ionicons name="shield-checkmark" size={36} color={t.accentPrimary} />
        </View>
      </View>
      <Text variant="display-md" align="center" style={{ marginTop: 16 }}>
        Activa la verificación en 2 pasos
      </Text>
      <Text variant="callout" tone="secondary" align="center" style={{ marginTop: 8, marginBottom: 28 }}>
        Protege tu cuenta exigiendo un código adicional al iniciar sesión.
      </Text>

      <Surface variant="elevated" padding={5} radius="xl" border="subtle">
        {benefits.map((b, i) => (
          <View key={b.title} style={[styles.benefitRow, i > 0 && { marginTop: 16 }]}>
            <View style={[styles.benefitIcon, { backgroundColor: t.accentSubtle }]}>
              <Ionicons name={b.icon} size={18} color={t.accentPrimary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="body-strong">{b.title}</Text>
              <Text variant="callout" tone="secondary" style={{ marginTop: 2 }}>{b.desc}</Text>
            </View>
          </View>
        ))}
      </Surface>

      <Button
        label="Activar 2FA"
        size="lg"
        fullWidth
        loading={busy}
        leadingIcon={<Ionicons name="lock-closed" size={18} color="#FFFFFF" />}
        onPress={onStart}
        style={{ marginTop: 24 }}
      />
      <Text variant="caption" tone="tertiary" align="center" style={{ marginTop: 12 }}>
        Necesitarás una app de autenticación como 1Password, Authy o Google Authenticator.
      </Text>
    </Animated.View>
  );
}

function EnrollState({
  enrollment,
  code,
  onChangeCode,
  onVerify,
  busy,
}: {
  enrollment: EnrollmentData;
  code: string;
  onChangeCode: (c: string) => void;
  onVerify: (c: string) => void;
  busy: boolean;
}) {
  return (
    <Animated.View entering={FadeIn.duration(280)}>
      <Text variant="display-md">Escanea el código</Text>
      <Text variant="callout" tone="secondary" style={{ marginTop: 6, marginBottom: 20 }}>
        Abre tu app de autenticación y escanea este QR. Luego ingresa el código que aparece.
      </Text>

      <QRDisplay qrSource={enrollment.qr} secret={enrollment.secret} />

      <Text variant="overline" tone="tertiary" style={{ marginTop: 28, marginBottom: 12 }}>
        Código de 6 dígitos
      </Text>
      <TOTPInput
        value={code}
        onChange={onChangeCode}
        onComplete={(c) => onVerify(c)}
        disabled={busy}
      />

      <Button
        label="Verificar"
        size="lg"
        fullWidth
        loading={busy}
        disabled={code.length !== 6}
        onPress={() => onVerify(code)}
        style={{ marginTop: 24 }}
      />
    </Animated.View>
  );
}

function ActiveState({
  backupCodes,
  onDisable,
  justEnrolled,
}: {
  backupCodes: string[];
  onDisable: () => void;
  justEnrolled: boolean;
}) {
  const t = useTheme();
  return (
    <Animated.View entering={FadeIn.duration(360)}>
      <View style={styles.heroIcon}>
        <View style={[styles.heroIconCircle, { backgroundColor: t.semantic.success + '22' }]}>
          <Ionicons name="checkmark-circle" size={40} color={t.semantic.success} />
        </View>
      </View>
      <Text variant="display-md" align="center" style={{ marginTop: 16 }}>
        2FA activada
      </Text>
      <Text variant="callout" tone="secondary" align="center" style={{ marginTop: 8, marginBottom: 24 }}>
        Tu cuenta ahora pide un código al iniciar sesión.
      </Text>

      {justEnrolled && backupCodes.length > 0 && (
        <View style={{ marginBottom: 24 }}>
          <BackupCodesList codes={backupCodes} />
        </View>
      )}

      <Surface variant="elevated" padding={5} radius="xl" border="subtle">
        <View style={styles.benefitRow}>
          <View style={[styles.benefitIcon, { backgroundColor: t.semantic.warning + '22' }]}>
            <Ionicons name="alert-circle" size={18} color={t.semantic.warning} />
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="body-strong">¿Perdiste tu app de autenticación?</Text>
            <Text variant="callout" tone="secondary" style={{ marginTop: 2 }}>
              Usa uno de tus códigos de respaldo. Si tampoco los tienes, contacta soporte.
            </Text>
          </View>
        </View>
      </Surface>

      <Button
        label="Desactivar 2FA"
        variant="ghost"
        size="md"
        fullWidth
        onPress={onDisable}
        style={{ marginTop: 28 }}
      />
    </Animated.View>
  );
}

function VerifyDisableState({
  code,
  onChangeCode,
  onConfirm,
  onCancel,
  busy,
}: {
  code: string;
  onChangeCode: (c: string) => void;
  onConfirm: (c: string) => void;
  onCancel: () => void;
  busy: boolean;
}) {
  return (
    <Animated.View entering={FadeIn.duration(280)}>
      <Text variant="display-md">Confirma con tu código</Text>
      <Text variant="callout" tone="secondary" style={{ marginTop: 6, marginBottom: 24 }}>
        Para desactivar 2FA ingresa el código de 6 dígitos de tu app de autenticación.
      </Text>

      <TOTPInput
        value={code}
        onChange={onChangeCode}
        onComplete={(c) => onConfirm(c)}
        disabled={busy}
      />

      <Button
        label="Desactivar 2FA"
        variant="danger"
        size="lg"
        fullWidth
        loading={busy}
        disabled={code.length !== 6}
        onPress={() => onConfirm(code)}
        style={{ marginTop: 24 }}
      />
      <Button
        label="Cancelar"
        variant="ghost"
        size="md"
        fullWidth
        onPress={onCancel}
        style={{ marginTop: 8 }}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    padding: 24,
    paddingBottom: 80,
  },
  heroIcon: {
    alignItems: 'center',
    marginTop: 16,
  },
  heroIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  benefitIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
