import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS } from '@/lib/constants';
import { track } from '@/lib/analytics';
import { hapticButtonPress, hapticPurchaseSuccess, hapticPurchaseError, hapticPaywallOpen } from '@/lib/haptics';
import { getMonthlyPackage, purchasePackage, restorePurchases } from '@/lib/purchases';
import { useAuthStore } from '@/stores/authStore';
import AnimatedPressable from '@/components/AnimatedPressable';
import { showToast } from '@/components/Toast';
import { PRICING, PRICING_COPY, formatPrice } from '@/lib/pricing';

/** Local type to avoid importing react-native-purchases (crashes Expo Go) */
interface RCPackage {
  identifier: string;
  product: {
    priceString: string;
    introPrice?: { price: number; priceString?: string };
  };
}

interface PaywallProps {
  visible: boolean;
  onClose: () => void;
  trigger?: string;
}

const BENEFITS = [
  { icon: 'infinite-outline' as const, title: 'Notas ilimitadas', desc: 'Sin límite diario de grabaciones' },
  { icon: 'time-outline' as const, title: 'Audios de hasta 30 min', desc: 'Graba reuniones completas sin cortes' },
  { icon: 'layers-outline' as const, title: 'Los 9 modos de salida', desc: 'Plan de acción, reporte ejecutivo, estudio y más' },
  { icon: 'chatbubbles-outline' as const, title: 'Chat con IA', desc: 'Pregunta lo que sea sobre tus notas' },
  { icon: 'grid-outline' as const, title: 'Exportación avanzada', desc: 'PDF, Excel y compartir por modo' },
  { icon: 'sparkles-outline' as const, title: 'Reconversiones ilimitadas', desc: 'Un audio, todos los formatos que necesites' },
];

export default function Paywall({ visible, onClose, trigger }: PaywallProps) {
  const [pkg, setPkg] = useState<RCPackage | null>(null);
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [loadingOffering, setLoadingOffering] = useState(true);
  const { setPlan } = useAuthStore();

  // Fetch offering when paywall opens
  useEffect(() => {
    if (!visible) return;
    track('premium_paywall_viewed', { trigger: trigger ?? 'paywall' });
    setLoadingOffering(true);
    let cancelled = false;
    getMonthlyPackage()
      .then((p) => { if (!cancelled) setPkg(p); })
      .catch((err) => {
        if (__DEV__) console.warn('[paywall] getMonthlyPackage failed:', err);
        if (!cancelled) setPkg(null);
      })
      .finally(() => { if (!cancelled) setLoadingOffering(false); });
    return () => { cancelled = true; };
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
      hapticPurchaseSuccess();
      setPlan('premium', 'ios');
      showToast('¡Bienvenido a Sythio Premium!', 'success');
      onClose();
    } else if (result.cancelled) {
      // User cancelled — do nothing, stay on paywall
    } else {
      hapticPurchaseError();
      showToast(result.error ?? 'Error al procesar la compra', 'error');
    }
  };

  const handleRestore = async () => {
    setRestoring(true);
    hapticButtonPress();
    const result = await restorePurchases();
    setRestoring(false);

    if (result.success) {
      hapticPurchaseSuccess();
      setPlan('premium', 'ios');
      showToast('¡Suscripción restaurada!', 'success');
      onClose();
    } else if (result.error) {
      hapticPurchaseError();
      showToast(result.error, 'error');
    } else {
      showToast('No se encontraron compras previas', 'info');
    }
  };

  const handleClose = () => {
    track('premium_paywall_dismissed', { trigger: trigger ?? 'paywall' });
    onClose();
  };

  // Price from RevenueCat or fallback to lib/pricing.ts
  const priceLabel = pkg?.product?.priceString ?? formatPrice(PRICING.premium.priceMonthly);
  const introOffer = pkg?.product?.introPrice;
  const hasFreeTrial = introOffer && introOffer.price === 0;

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
              <Text style={styles.title}>{PRICING_COPY.premium.title}</Text>
              <Text style={styles.subtitle}>{PRICING_COPY.premium.subtitle}</Text>
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
                {hasFreeTrial && (
                  <View style={styles.trialBadge}>
                    <Text style={styles.trialBadgeText}>7 días gratis</Text>
                  </View>
                )}
                <Text style={styles.pricingLabel}>Mensual</Text>
                <View style={styles.pricingRow}>
                  <Text style={styles.pricingAmount}>{priceLabel}</Text>
                  <Text style={styles.pricingPeriod}>/mes</Text>
                </View>
                <Text style={styles.pricingNote}>
                  {hasFreeTrial ? 'Prueba gratis, luego cancela cuando quieras' : 'Cancela cuando quieras'}
                </Text>
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
              El pago se cargará a tu cuenta de Apple. La suscripción ({priceLabel}/mes) se renueva automáticamente a menos que se cancele al menos 24 horas antes del fin del período actual. Gestiona tu suscripción desde Configuración {'>'} Apple ID {'>'} Suscripciones.
            </Text>
            <Text style={styles.legalLinks}>
              <Text style={styles.legalLink} onPress={() => Linking.openURL('https://sythio.app/terms')}>Términos</Text>
              {'  ·  '}
              <Text style={styles.legalLink} onPress={() => Linking.openURL('https://sythio.app/privacy-policy')}>Privacidad</Text>
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
  trialBadge: { backgroundColor: COLORS.primaryLight, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 8, marginBottom: 8 },
  trialBadgeText: { fontSize: 12, fontWeight: '700', color: COLORS.primary },
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
  legalLinks: { fontSize: 11, color: COLORS.textMuted, textAlign: 'center', marginTop: 8 },
  legalLink: { textDecorationLine: 'underline' as const },
});
