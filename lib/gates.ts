/**
 * Sythio Freemium Gates — Single source of truth for all plan restrictions.
 *
 * Every gate check in the app MUST go through these functions.
 * The server (edge functions) enforces the same rules independently.
 *
 * Supports 3 tiers: free, premium ($14.99), enterprise (custom org pricing).
 */

import { LIMITS, FREE_MODES } from '@/lib/constants';
import type { User, OutputMode, Organization } from '@/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type GateReason =
  | 'daily_limit'
  | 'requires_premium'
  | 'audio_too_long'
  | 'daily_minutes_exceeded'
  | 'org_inactive'
  | 'user_suspended';

export interface GateResult {
  allowed: boolean;
  reason?: GateReason;
  message?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isPaidPlan(user: User): boolean {
  return user.plan === 'premium' || user.plan === 'enterprise';
}

// ---------------------------------------------------------------------------
// Gate checks
// ---------------------------------------------------------------------------

/**
 * Can the user create a new note right now?
 * Checks daily_count against plan limit, auto-resets if new day.
 * For enterprise users with custom org limits, pass the org object.
 */
export function canCreateNote(user: User, org?: Organization | null): GateResult {
  // Enterprise: check org is active
  if (user.plan === 'enterprise' && org) {
    if (!org.active) {
      return {
        allowed: false,
        reason: 'org_inactive',
        message: 'Tu organización no tiene una suscripción activa. Contacta a tu administrador.',
      };
    }
  }

  const today = new Date().toISOString().split('T')[0];
  const dailyCount = user.last_reset_date < today ? 0 : user.daily_count;

  let limit: number;
  if (user.plan === 'enterprise') {
    limit = org?.custom_notes_per_day ?? LIMITS.ENTERPRISE_DAILY_NOTES;
  } else if (user.plan === 'premium') {
    limit = LIMITS.PREMIUM_DAILY_NOTES;
  } else {
    limit = LIMITS.FREE_DAILY_NOTES;
  }

  if (dailyCount >= limit) {
    return { allowed: false, reason: 'daily_limit' };
  }
  return { allowed: true };
}

/**
 * Can the user use this specific output mode?
 * Free users can only use the 5 free modes. Premium & Enterprise can use all.
 */
export function canUseMode(mode: OutputMode, user: User): GateResult {
  if (isPaidPlan(user)) return { allowed: true };
  if (FREE_MODES.includes(mode)) return { allowed: true };
  return { allowed: false, reason: 'requires_premium' };
}

/**
 * Can the user use advanced export (PDF/Excel)?
 * Only premium and enterprise users.
 */
export function canExportAdvanced(user: User): GateResult {
  if (isPaidPlan(user)) return { allowed: true };
  return { allowed: false, reason: 'requires_premium' };
}

/**
 * How many notes remain for today?
 */
export function getRemainingNotes(user: User, org?: Organization | null): number {
  const today = new Date().toISOString().split('T')[0];
  const dailyCount = user.last_reset_date < today ? 0 : user.daily_count;

  let limit: number;
  if (user.plan === 'enterprise') {
    limit = org?.custom_notes_per_day ?? LIMITS.ENTERPRISE_DAILY_NOTES;
  } else if (user.plan === 'premium') {
    limit = LIMITS.PREMIUM_DAILY_NOTES;
  } else {
    limit = LIMITS.FREE_DAILY_NOTES;
  }

  return Math.max(0, limit - dailyCount);
}

/**
 * Max audio duration in seconds for this user's plan.
 */
export function getMaxAudioDuration(user: User): number {
  if (user.plan === 'enterprise') return LIMITS.ENTERPRISE_MAX_AUDIO_DURATION;
  if (user.plan === 'premium') return LIMITS.PREMIUM_MAX_AUDIO_DURATION;
  return LIMITS.FREE_MAX_AUDIO_DURATION;
}

/**
 * Max daily audio minutes for the user's plan.
 * For enterprise with custom limits, pass the org object.
 */
export function getMaxDailyMinutes(user: User, org?: Organization | null): number {
  if (user.plan === 'enterprise') {
    return org?.custom_audio_minutes_per_day ?? LIMITS.ENTERPRISE_MAX_DAILY_AUDIO_MINUTES;
  }
  if (user.plan === 'premium') return LIMITS.PREMIUM_MAX_DAILY_AUDIO_MINUTES;
  return LIMITS.FREE_MAX_DAILY_AUDIO_MINUTES;
}

/**
 * Is the given audio duration within the user's plan limit?
 */
export function canRecordDuration(durationSeconds: number, user: User): GateResult {
  const max = getMaxAudioDuration(user);
  if (durationSeconds > max) {
    return { allowed: false, reason: 'audio_too_long' };
  }
  return { allowed: true };
}
