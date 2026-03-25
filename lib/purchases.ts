/**
 * Sythio Purchases — RevenueCat integration.
 *
 * Handles subscription lifecycle: configure, purchase, restore, entitlement check.
 *
 * SETUP REQUIRED (outside code):
 * 1. Create a RevenueCat project at https://app.revenuecat.com
 * 2. Add iOS app with bundle ID com.sythio.app
 * 3. Create an entitlement called "premium"
 * 4. Create an offering with a monthly $4.99 package
 * 5. Set REVENUECAT_API_KEY below (or move to .env)
 * 6. Configure App Store Connect subscription in-app purchases
 */

import Purchases, {
  PurchasesOffering,
  PurchasesPackage,
  CustomerInfo,
  LOG_LEVEL,
} from 'react-native-purchases';
import { Platform } from 'react-native';
import { track } from '@/lib/analytics';

// ---------------------------------------------------------------------------
// Config — Replace with real key from RevenueCat dashboard
// ---------------------------------------------------------------------------

const REVENUECAT_IOS_KEY = 'appl_REPLACE_WITH_YOUR_REVENUECAT_API_KEY';
const ENTITLEMENT_ID = 'premium';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let configured = false;

// ---------------------------------------------------------------------------
// Core functions
// ---------------------------------------------------------------------------

/**
 * Initialize RevenueCat. Call once on app startup.
 */
export async function configurePurchases(userId?: string): Promise<void> {
  if (configured) return;

  if (__DEV__) {
    Purchases.setLogLevel(LOG_LEVEL.DEBUG);
  }

  Purchases.configure({
    apiKey: REVENUECAT_IOS_KEY,
    ...(userId ? { appUserID: userId } : {}),
  });

  configured = true;
}

/**
 * Fetch current offerings from RevenueCat.
 * Returns the "default" offering or null.
 */
export async function fetchOffering(): Promise<PurchasesOffering | null> {
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
 * Purchase a package. Returns customer info on success, null on cancel/failure.
 */
export async function purchasePackage(
  pkg: PurchasesPackage,
): Promise<{ success: boolean; customerInfo?: CustomerInfo; cancelled?: boolean; error?: string }> {
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
    const error = err as { userCancelled?: boolean; message?: string };
    if (error.userCancelled) {
      track('purchase_cancelled', {});
      return { success: false, cancelled: true };
    }
    track('purchase_failed', { error: error.message ?? 'unknown' });
    return { success: false, error: error.message ?? 'Error desconocido' };
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
 */
export async function checkPremiumEntitlement(): Promise<boolean> {
  try {
    const customerInfo = await Purchases.getCustomerInfo();
    return customerInfo.entitlements.active[ENTITLEMENT_ID] != null;
  } catch {
    return false;
  }
}

/**
 * Listen for customer info changes (e.g., subscription renewal/expiry).
 * Returns an unsubscribe function.
 */
export function onCustomerInfoUpdated(
  callback: (isPremium: boolean) => void,
): () => void {
  const listener = (info: CustomerInfo) => {
    const isPremium = info.entitlements.active[ENTITLEMENT_ID] != null;
    callback(isPremium);
  };
  Purchases.addCustomerInfoUpdateListener(listener);
  return () => Purchases.removeCustomerInfoUpdateListener(listener);
}
