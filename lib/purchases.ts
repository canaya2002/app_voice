/**
 * Sythio Purchases — RevenueCat integration.
 *
 * Handles the full subscription lifecycle:
 *   configure → purchase → restore → entitlement check → sync with Supabase
 *
 * IMPORTANT: react-native-purchases is lazy-loaded via require() to avoid
 * crashing in Expo Go, where the native module is not available.
 * Only runs on native iOS builds (not web, not Expo Go).
 *
 * SETUP REQUIRED (outside code):
 * ─────────────────────────────────────────────────────────────────────────────
 * App Store Connect:
 *   1. Go to Monetization > Subscriptions
 *   2. Create subscription group "Sythio Premium"
 *   3. Add product:
 *      - Reference Name: "Sythio Premium Monthly"
 *      - Product ID: com.sythio.app.premium.monthly
 *      - Duration: 1 Month
 *      - Price: $15.00
 *      - Localization (es-MX): "Sythio Premium" / "Acceso completo a todos los modos"
 *   4. Add introductory offer: Free Trial, 7 days
 *   5. In App Store Connect > App > Subscriptions, add the product to your app
 *
 * RevenueCat Dashboard:
 *   1. Create project at https://app.revenuecat.com
 *   2. Add iOS app with bundle ID com.sythio.app
 *   3. Connect App Store Connect via Shared Secret
 *   4. Create entitlement "premium"
 *   5. Create offering "default" with package "$rc_monthly" → your Apple product
 *   6. Copy the iOS API key below
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { track } from '@/lib/analytics';

// Local types to avoid importing react-native-purchases (crashes Expo Go)
type PurchasesOffering = {
  monthly: PurchasesPackage | null;
  availablePackages: PurchasesPackage[];
};
type PurchasesPackage = {
  identifier: string;
  product: { priceString: string; introPrice?: { price: number } };
};
type CustomerInfo = {
  entitlements: { active: Record<string, unknown> };
};

// ---------------------------------------------------------------------------
// Config — Replace with real key from RevenueCat dashboard
// ---------------------------------------------------------------------------

const REVENUECAT_IOS_KEY = 'appl_REPLACE_WITH_YOUR_REVENUECAT_API_KEY';
const ENTITLEMENT_ID = 'premium';

// ---------------------------------------------------------------------------
// Expo Go guard — react-native-purchases requires a native dev build
// ---------------------------------------------------------------------------

const isExpoGo = Constants.appOwnership === 'expo';
const canUsePurchases = Platform.OS === 'ios' && !isExpoGo;

/**
 * Lazy-load the Purchases SDK to avoid crash in Expo Go.
 * The native module only exists in custom dev-client / production builds.
 */
function getRCModule(): any {
  if (!canUsePurchases) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('react-native-purchases').default;
  } catch {
    if (__DEV__) console.warn('[purchases] react-native-purchases native module not available');
    return null;
  }
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let configured = false;

// ---------------------------------------------------------------------------
// Core functions
// ---------------------------------------------------------------------------

/**
 * Initialize RevenueCat. Call once on app startup.
 * Pass the Supabase user ID to link RevenueCat customer with your backend.
 */
export async function configurePurchases(userId?: string): Promise<void> {
  if (configured || !canUsePurchases) return;

  if (REVENUECAT_IOS_KEY.includes('REPLACE')) {
    if (__DEV__) console.warn('[purchases] RevenueCat API key not configured — skipping init');
    return;
  }

  const Purchases = getRCModule();
  if (!Purchases) return;

  if (__DEV__) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { LOG_LEVEL } = require('react-native-purchases');
    Purchases.setLogLevel(LOG_LEVEL.DEBUG);
  }

  Purchases.configure({
    apiKey: REVENUECAT_IOS_KEY,
    ...(userId ? { appUserID: userId } : {}),
  });

  configured = true;
}

/**
 * Set the app user ID after login (links RevenueCat customer to Supabase user).
 */
export async function identifyUser(userId: string): Promise<void> {
  if (!configured) return;
  const Purchases = getRCModule();
  if (!Purchases) return;
  try {
    await Purchases.logIn(userId);
  } catch (err) {
    if (__DEV__) console.warn('[purchases] identifyUser error:', err);
  }
}

/**
 * Fetch current offerings from RevenueCat.
 * Returns the "default" offering or null.
 */
export async function fetchOffering(): Promise<PurchasesOffering | null> {
  const Purchases = getRCModule();
  if (!Purchases || !configured) return null;
  try {
    const offerings = await Purchases.getOfferings();
    return offerings.current ?? null;
  } catch (err) {
    if (__DEV__) console.warn('[purchases] fetchOffering error:', err);
    return null;
  }
}

/**
 * Get the main monthly package from the current offering.
 */
export async function getMonthlyPackage(): Promise<PurchasesPackage | null> {
  const offering = await fetchOffering();
  if (!offering) return null;
  return offering.monthly ?? offering.availablePackages[0] ?? null;
}

/**
 * Purchase a package. Returns structured result.
 * Handles cancellation silently — it's not an error.
 */
export async function purchasePackage(
  pkg: PurchasesPackage,
): Promise<{ success: boolean; customerInfo?: CustomerInfo; cancelled?: boolean; error?: string }> {
  const Purchases = getRCModule();
  if (!Purchases || !configured) return { success: false, error: 'Purchases not available' };
  try {
    track('purchase_started', { product: pkg.identifier });
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    const isPremium = customerInfo.entitlements.active[ENTITLEMENT_ID] != null;

    if (isPremium) {
      track('purchase_completed', { product: pkg.identifier });
      track('premium_unlocked', { source: 'purchase' });
    }

    return { success: isPremium, customerInfo };
  } catch (err: unknown) {
    const error = err as { userCancelled?: boolean; code?: string; message?: string };

    if (error.userCancelled) {
      track('purchase_cancelled', {});
      return { success: false, cancelled: true };
    }

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PURCHASES_ERROR_CODE } = require('react-native-purchases');
    let message = error.message ?? 'Error desconocido';
    if (error.code === String(PURCHASES_ERROR_CODE.NETWORK_ERROR)) {
      message = 'Sin conexión. Verifica tu internet.';
    } else if (error.code === String(PURCHASES_ERROR_CODE.PAYMENT_PENDING_ERROR)) {
      message = 'Tu compra está siendo procesada.';
    }

    track('purchase_failed', { error: error.message ?? 'unknown' });
    return { success: false, error: message };
  }
}

/**
 * Restore previous purchases. Returns whether premium was restored.
 */
export async function restorePurchases(): Promise<{
  success: boolean;
  customerInfo?: CustomerInfo;
  error?: string;
}> {
  const Purchases = getRCModule();
  if (!Purchases || !configured) return { success: false, error: 'Purchases not available' };
  try {
    track('restore_started', {});
    const customerInfo = await Purchases.restorePurchases();
    const isPremium = customerInfo.entitlements.active[ENTITLEMENT_ID] != null;

    if (isPremium) {
      track('restore_completed', { found: true });
      track('premium_unlocked', { source: 'restore' });
    } else {
      track('restore_completed', { found: false });
    }

    return { success: isPremium, customerInfo };
  } catch (err: unknown) {
    const error = err as { message?: string };
    track('restore_failed', { error: error.message ?? 'unknown' });
    return { success: false, error: error.message ?? 'Error al restaurar' };
  }
}

/**
 * Check if user currently has premium entitlement.
 * This is the source of truth — not profiles.plan.
 */
export async function checkPremiumEntitlement(): Promise<boolean> {
  const Purchases = getRCModule();
  if (!Purchases || !configured) return false;
  try {
    const customerInfo = await Purchases.getCustomerInfo();
    return customerInfo.entitlements.active[ENTITLEMENT_ID] != null;
  } catch {
    return false;
  }
}

/**
 * Full subscription status check. Returns 'free' or 'premium'.
 */
export async function checkSubscriptionStatus(): Promise<'free' | 'premium'> {
  const isPremium = await checkPremiumEntitlement();
  return isPremium ? 'premium' : 'free';
}

/**
 * Listen for customer info changes (e.g., subscription renewal/expiry).
 * Returns an unsubscribe function.
 */
export function onCustomerInfoUpdated(
  callback: (isPremium: boolean) => void,
): () => void {
  const Purchases = getRCModule();
  if (!Purchases || !configured) return () => {};

  const listener = (info: CustomerInfo) => {
    const isPremium = info.entitlements.active[ENTITLEMENT_ID] != null;
    callback(isPremium);
  };
  Purchases.addCustomerInfoUpdateListener(listener);
  return () => Purchases.removeCustomerInfoUpdateListener(listener);
}
