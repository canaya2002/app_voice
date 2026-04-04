import { supabase } from '../supabase';

// ── Types ───────────────────────────────────────────────────────────────
export interface SubscriptionInfo {
  plan: 'free' | 'pro' | 'team' | 'premium';
  platform: 'ios' | 'web' | 'android' | null;
  status: 'active' | 'trial' | 'cancelled' | 'expired' | null;
  currentPeriodEnd: string | null;
  canManageHere: boolean;
}

// ── Get effective plan (calls Postgres function) ────────────────────────
export async function getEffectivePlan(userId: string): Promise<string> {
  const { data, error } = await supabase.rpc('get_user_effective_plan', {
    p_user_id: userId,
  });
  if (error) {
    console.error('Error getting effective plan:', error);
    return 'free';
  }
  return (data as string) || 'free';
}

// ── Get full subscription details ───────────────────────────────────────
export async function getSubscriptionDetails(userId: string): Promise<SubscriptionInfo> {
  const { data, error } = await supabase.rpc('get_subscription_details', {
    p_user_id: userId,
  });

  if (error || !data || (Array.isArray(data) && data.length === 0)) {
    return {
      plan: 'free',
      platform: null,
      status: null,
      currentPeriodEnd: null,
      canManageHere: true, // free users can upgrade from web
    };
  }

  const row = Array.isArray(data) ? data[0] : data;
  return {
    plan: row.plan as SubscriptionInfo['plan'],
    platform: row.platform as SubscriptionInfo['platform'],
    status: row.status as SubscriptionInfo['status'],
    currentPeriodEnd: row.current_period_end,
    canManageHere: row.can_manage_here ?? false,
  };
}

// ── Check if subscription can be managed from this platform ─────────────
export function canManageSubscription(sub: SubscriptionInfo): boolean {
  // Free users can always upgrade from web
  if (sub.plan === 'free') return true;
  // Only web subscriptions can be managed from web
  return sub.platform === 'web';
}

// ── Get platform display label ──────────────────────────────────────────
export function getPlatformLabel(platform: string | null): string {
  switch (platform) {
    case 'ios': return 'App Store (iOS)';
    case 'android': return 'Google Play (Android)';
    case 'web': return 'Web (Stripe)';
    default: return 'Ninguna';
  }
}

// ── Get management instructions per platform ────────────────────────────
export function getPlatformManageInstructions(platform: string | null): string {
  switch (platform) {
    case 'ios':
      return 'Para administrar o cancelar tu suscripcion, abre tu iPhone: Ajustes → Apple ID → Suscripciones → Sythio';
    case 'android':
      return 'Para administrar o cancelar tu suscripcion, abre Google Play Store → Suscripciones → Sythio';
    default:
      return '';
  }
}

// ── Log platform session ────────────────────────────────────────────────
export async function logPlatformSession(userId: string): Promise<void> {
  try {
    await supabase.from('platform_sessions').upsert(
      {
        user_id: userId,
        platform: 'web',
        last_seen: new Date().toISOString(),
        device_info: {
          userAgent: navigator.userAgent,
          language: navigator.language,
          screen: `${screen.width}x${screen.height}`,
        },
      },
      { onConflict: 'user_id,platform' }
    );
  } catch {
    // Non-critical — silently fail
  }
}

// ── Get user's platform sessions (to detect cross-platform usage) ───────
export async function getUserPlatforms(userId: string): Promise<string[]> {
  const { data } = await supabase
    .from('platform_sessions')
    .select('platform')
    .eq('user_id', userId);
  return (data ?? []).map((r: { platform: string }) => r.platform);
}

// ── Plan display helpers ────────────────────────────────────────────────
export function getPlanLabel(plan: string): string {
  switch (plan) {
    case 'team': return 'Enterprise';
    case 'pro': return 'Pro';
    case 'premium': return 'Premium';
    default: return 'Free';
  }
}

export function getPlanColor(plan: string): string {
  switch (plan) {
    case 'team': return 'var(--amber)';
    case 'pro': return 'var(--accent)';
    case 'premium': return 'var(--accent)';
    default: return 'var(--text3)';
  }
}
