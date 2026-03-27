/**
 * Sythio Freemium Gates — Single source of truth for all plan restrictions.
 *
 * Every gate check in the app MUST go through these functions.
 * The server (edge functions) enforces the same rules independently.
 */

import { LIMITS, FREE_MODES } from '@/lib/constants';
import type { User, OutputMode } from '@/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type GateReason = 'daily_limit' | 'requires_premium' | 'audio_too_long';

export interface GateResult {
  allowed: boolean;
  reason?: GateReason;
}

// ---------------------------------------------------------------------------
// Gate checks
// ---------------------------------------------------------------------------

/**
 * Can the user create a new note right now?
 * Checks daily_count against plan limit, auto-resets if new day.
 */
export function canCreateNote(user: User): GateResult {
  const today = new Date().toISOString().split('T')[0];
  const dailyCount = user.last_reset_date < today ? 0 : user.daily_count;
  const limit = user.plan === 'premium' ? LIMITS.PREMIUM_DAILY_NOTES : LIMITS.FREE_DAILY_NOTES;

  if (dailyCount >= limit) {
    return { allowed: false, reason: 'daily_limit' };
  }
  return { allowed: true };
}

/**
 * Can the user use this specific output mode?
 * Free users can only use the 4 free modes.
 */
export function canUseMode(mode: OutputMode, user: User): GateResult {
  if (user.plan === 'premium') return { allowed: true };
  if (FREE_MODES.includes(mode)) return { allowed: true };
  return { allowed: false, reason: 'requires_premium' };
}

/**
 * Can the user use advanced export (PDF/Excel)?
 * Only premium users.
 */
export function canExportAdvanced(user: User): GateResult {
  if (user.plan === 'premium') return { allowed: true };
  return { allowed: false, reason: 'requires_premium' };
}

/**
 * How many notes remain for today?
 */
export function getRemainingNotes(user: User): number {
  const today = new Date().toISOString().split('T')[0];
  const dailyCount = user.last_reset_date < today ? 0 : user.daily_count;
  const limit = user.plan === 'premium' ? LIMITS.PREMIUM_DAILY_NOTES : LIMITS.FREE_DAILY_NOTES;
  return Math.max(0, limit - dailyCount);
}

/**
 * Max audio duration in seconds for this user's plan.
 */
export function getMaxAudioDuration(user: User): number {
  return user.plan === 'premium'
    ? LIMITS.PREMIUM_MAX_AUDIO_DURATION
    : LIMITS.FREE_MAX_AUDIO_DURATION;
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
