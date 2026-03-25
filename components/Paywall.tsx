import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { PurchasesPackage } from 'react-native-purchases';
import { COLORS } from '@/lib/constants';
import { track } from '@/lib/analytics';
import { lightTap, successTap, errorTap } from '@/lib/haptics';
import { getMonthlyPackage, purchasePackage, restorePurchases } from '@/lib/purchases';
import { useAuthStore } from '@/stores/authStore';
import AnimatedPressable from '@/components/AnimatedPressable';
import { showToast } from '@/components/Toast';

interface PaywallProps {
  visible: boolean;
  onClose: () => void;
  trigger?: string;
}

const BENEFITS = [
  { icon: 'infinite-outline' as const, title: 'Notas ilimitadas', desc: 'Sin límite diario de grabaciones' },
  { icon: 'time-outline' as const, title: 'Audios de hasta 30 min', desc: 'Graba reuniones completas sin cortes' },
  { icon: 'layers-outline' as const, title: 'Los 8 modos de salida', desc: 'Action Plan, Executive Report, Study y más' },
  { icon: 'grid-outline' as const, title: 'Exportación avanzada', desc: 'PDF, Excel y compartir por modo' },
  { icon: 'sparkles-outline' as const, title: 'Reconversiones ilimitadas', desc: 'Un audio, todos los formatos que necesites' },
];

export default function Paywall({ visible, onClose, trigger }: PaywallProps) {
  const [pkg, setPkg] = useState<PurchasesPackage | null>(null);
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [loadingOffering, setLoadingOffering] = useState(true);
  const { setPlan } = useAuthStore();

  // Fetch offering when paywall opens
  useEffect(() => {
    if (!visible) return;
    track('premium_paywall_viewed', { trigger: trigger ?? 'paywall' });
    setLoadingOffering(true);
    getMonthlyPackage().then((p) => {
      setPkg(p);
      setLoadingOffering(false);
    });
  }, [visible, trigger]);

  const handleSubscribe = async () => {
    if (!pkg) {
      showToast('No se pudo cargar el plan. Intenta de nuevo.', 'error');
      return;
    }
    setLoading(true);
    const result = await purchasePackage(pkg);
    setLoading(false);

    if (result.success) {
      successTap();
      setPlan('premium');
      showToast('¡Bienvenido a Sythio Premium!', 'success');
      onClose();
    } else if (result.cancelled) {
      // User cancelled — do nothing, stay on paywall
    } else {
      errorTap();
      showToast(result.error ?? 'Error al procesar la compra', 'error');
    }
  };

  const handleRestore = async () => {
    setRestoring(true);
    lightTap();
    const result = await restorePurchases();
    setRestoring(false);

    if (result.success) {
      successTap();
      setPlan('premium');
      showToast('¡Suscripción restaurada!', 'success');
      onClose();
    } else if (result.error) {
      errorTap();
      showToast(result.error, 'error');
    } else {
      showToast('No se encontraron compras previas', 'info');
    }
  };

  const handleClose = () => {
    track('premium_paywall_dismissed', { trigger: trigger ?? 'paywall' });
    onClose();
  };

  // Price from RevenueCat or fallback
  const priceLabel = pkg?.product?.priceString ?? '$4.99';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
            {/* Close */}
            <Pressable style={styles.closeBtn} onPress={handleClose} hitSlop={12}>
              <Ionicons name="close" size={24} color={COLORS.textMuted} />
            </Pressable>

            {/* Header */}
            <View style={styles.header}>
              <Ionicons name="diamond" size={32} color={COLORS.primaryLight} />
              <Text style={styles.title}>Sythio Premium</Text>
              <Text style={styles.subtitle}>Desbloquea todo el poder de tu voz.</Text>
            </View>

            {/* Benefits */}
            <View style={styles.benefits}>
              {BENEFITS.map((b, i) => (
                <View key={i} style={styles.benefitRow}>
                  <View style={styles.benefitIcon}>
                    <Ionicons name={b.icon} size={20} color={COLORS.primaryLight} />
                  </View>
                  <View style={styles.benefitText}>
                    <Text style={styles.benefitTitle}>{b.title}</Text>
                    <Text style={styles.benefitDesc}>{b.desc}</Text>
                  </View>
                </View>
              ))}
            </View>

            {/* Pricing */}
            {loadingOffering ? (
              <View style={styles.pricingCard}>
                <ActivityIndicator color={COLORS.primary} />
              </View>
            ) : (
              <View style={styles.pricingCard}>
                <Text style={styles.pricingLabel}>Mensual</Text>
                <View style={styles.pricingRow}>
                  <Text style={styles.pricingAmount}>{priceLabel}</Text>
                  <Text style={styles.pricingPeriod}>/mes</Text>
                </View>
                <Text style={styles.pricingNote}>Cancela cuando quieras</Text>
              </View>
            )}

            {/* Subscribe */}
            <AnimatedPressable
              onPress={handleSubscribe}
              scaleDown={0.96}
              style={[styles.subscribeOuter, (loading || loadingOffering) && { opacity: 0.6 }]}
            >
              <LinearGradient
                colors={[COLORS.primary, COLORS.primaryDark]}
                style={styles.subscribeBtn}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.subscribeBtnText}>Suscribirse a Premium</Text>
                )}
              </LinearGradient>
            </AnimatedPressable>

            {/* Restore */}
            <AnimatedPressable onPress={handleRestore} style={styles.restoreBtn}>
              <Text style={styles.restoreText}>
                {restoring ? 'Buscando compras...' : 'Restaurar compra'}
              </Text>
            </AnimatedPressable>

            {/* Legal */}
            <Text style={styles.legalText}>
              El pago se cargará a tu cuenta de Apple. La suscripción se renueva automáticamente a menos que se cancele al menos 24 horas antes del fin del período.
            </Text>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: COLORS.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: '90%' },
  content: { padding: 28, paddingBottom: 40 },
  closeBtn: { alignSelf: 'flex-end', padding: 4 },
  header: { alignItems: 'center', marginBottom: 28 },
  title: { fontSize: 26, fontWeight: '800', color: COLORS.textPrimary, marginTop: 12, letterSpacing: -0.5 },
  subtitle: { fontSize: 15, color: COLORS.textSecondary, marginTop: 6, textAlign: 'center' },
  benefits: { gap: 16, marginBottom: 28 },
  benefitRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  benefitIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: COLORS.info + '15', alignItems: 'center', justifyContent: 'center' },
  benefitText: { flex: 1 },
  benefitTitle: { fontSize: 15, fontWeight: '600', color: COLORS.textPrimary },
  benefitDesc: { fontSize: 13, color: COLORS.textSecondary, marginTop: 1 },
  pricingCard: { alignItems: 'center', backgroundColor: COLORS.surfaceAlt, borderRadius: 16, padding: 20, marginBottom: 20, borderWidth: 2, borderColor: COLORS.primaryLight, minHeight: 80, justifyContent: 'center' },
  pricingLabel: { fontSize: 12, fontWeight: '600', color: COLORS.textSecondary, textTransform: 'uppercase', letterSpacing: 0.8 },
  pricingRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 4 },
  pricingAmount: { fontSize: 36, fontWeight: '800', color: COLORS.textPrimary, letterSpacing: -1 },
  pricingPeriod: { fontSize: 16, color: COLORS.textSecondary, marginLeft: 4 },
  pricingNote: { fontSize: 12, color: COLORS.textMuted, marginTop: 4 },
  subscribeOuter: { marginBottom: 12 },
  subscribeBtn: { height: 54, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  subscribeBtnText: { fontSize: 17, fontWeight: '700', color: '#FFFFFF' },
  restoreBtn: { alignItems: 'center', paddingVertical: 10 },
  restoreText: { fontSize: 14, color: COLORS.textMuted, fontWeight: '500' },
  legalText: { fontSize: 10, color: COLORS.textMuted, textAlign: 'center', lineHeight: 14, marginTop: 12 },
});
