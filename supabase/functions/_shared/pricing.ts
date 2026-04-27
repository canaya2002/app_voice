// Shared pricing source of truth for Supabase Edge Functions (Deno).
// Mirrors lib/pricing.ts on the client. Keep both files in sync when pricing changes.

export type Tier = "free" | "premium" | "enterprise";

export interface TierLimits {
  notesPerDay: number;            // Number.POSITIVE_INFINITY for unlimited
  maxDurationSec: number;
  modes: string[] | "all";
}

export const TIER_LIMITS: Record<Tier, TierLimits> = {
  free: {
    notesPerDay: 2,
    maxDurationSec: 600,
    modes: ["summary", "tasks", "clean_text", "ideas", "outline"],
  },
  premium: {
    notesPerDay: Number.POSITIVE_INFINITY,
    maxDurationSec: 1800,
    modes: "all",
  },
  enterprise: {
    notesPerDay: Number.POSITIVE_INFINITY,
    maxDurationSec: 3600,
    modes: "all",
  },
};

export function tierAllowsMode(tier: Tier, mode: string): boolean {
  const t = TIER_LIMITS[tier] ?? TIER_LIMITS.free;
  return t.modes === "all" || t.modes.includes(mode);
}

export function tierMaxDurationSec(tier: Tier): number {
  return (TIER_LIMITS[tier] ?? TIER_LIMITS.free).maxDurationSec;
}

export function tierNotesPerDay(tier: Tier): number {
  return (TIER_LIMITS[tier] ?? TIER_LIMITS.free).notesPerDay;
}
