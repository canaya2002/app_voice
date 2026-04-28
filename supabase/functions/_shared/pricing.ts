// Shared pricing source of truth for Supabase Edge Functions (Deno).
// Mirrors lib/pricing.ts on the client. Keep both files in sync when pricing changes.

export type Tier = "free" | "premium" | "pro_plus" | "enterprise";

export interface TierLimits {
  notesPerDay: number;            // Number.POSITIVE_INFINITY for unlimited
  maxDurationSec: number;
  maxDailyAudioMinutes: number;   // hard cap on total audio processed per day
  dailyConvertLimit: number;
  dailyChatLimit: number;
  modes: string[] | "all";
}

export const TIER_LIMITS: Record<Tier, TierLimits> = {
  free: {
    notesPerDay: 2,
    maxDurationSec: 600,
    maxDailyAudioMinutes: 20,
    dailyConvertLimit: 3,
    dailyChatLimit: 0,
    modes: ["summary", "tasks", "clean_text", "ideas", "outline"],
  },
  premium: {
    notesPerDay: 50,
    maxDurationSec: 1800,
    maxDailyAudioMinutes: 120,
    dailyConvertLimit: 50,
    dailyChatLimit: 100,
    modes: "all",
  },
  pro_plus: {
    notesPerDay: 200,
    maxDurationSec: 3600,
    maxDailyAudioMinutes: 480,
    dailyConvertLimit: 200,
    dailyChatLimit: 500,
    modes: "all",
  },
  enterprise: {
    notesPerDay: Number.POSITIVE_INFINITY,
    maxDurationSec: 7200,
    maxDailyAudioMinutes: Number.POSITIVE_INFINITY,
    dailyConvertLimit: Number.POSITIVE_INFINITY,
    dailyChatLimit: Number.POSITIVE_INFINITY,
    modes: "all",
  },
};

export function getTierLimits(tier: string): TierLimits {
  return TIER_LIMITS[tier as Tier] ?? TIER_LIMITS.free;
}

export function tierAllowsMode(tier: string, mode: string): boolean {
  const t = getTierLimits(tier);
  return t.modes === "all" || t.modes.includes(mode);
}
