/**
 * Sythio pricing — single source of truth.
 *
 * Tiers (2026-04-28 restructure):
 *   - free      $0          — 2 notas/día, 5 modos
 *   - premium   $14.99/mes  — 50 notas/día, 9 modos, chat IA, exports
 *   - pro_plus  $29.99/mes  — 200 notas/día, todo lo de premium + más cap
 *   - enterprise CUSTOM     — B2B 5+ usuarios, NO autoservicio (formulario web → manual provisioning)
 *
 * Mobile billing: RevenueCat (iOS/Android). Entitlement IDs: 'premium', 'pro_plus'.
 * Web billing: Stripe Checkout. Price IDs en env vars (STRIPE_PRICE_PREMIUM_*, STRIPE_PRICE_PRO_PLUS_*).
 * Enterprise: NO Stripe ni RevenueCat — onboarding manual desde Supabase Dashboard tras leads.
 *
 * Subscriptions DO NOT transfer between platforms. Ver docs/billing-architecture.md.
 */

import type { OutputMode } from '@/types';

export type Tier = 'free' | 'premium' | 'pro_plus' | 'enterprise';
export type Interval = 'month' | 'year';

export interface TierFeatures {
  aiChat: boolean;
  excelExport: boolean;
  pdfExport: boolean;
  sharing: boolean;
  api: boolean;
  workspaces: boolean;
  prioritySupport: boolean;
  mcp: boolean;
}

export interface TierConfig {
  id: Tier;
  label: string;
  priceMonthly: number;          // 0 for free; -1 for enterprise (custom)
  priceYearly: number;
  notesPerDay: number;
  maxDurationSec: number;
  maxDailyAudioMinutes: number;  // hard cap on total audio processed per day
  dailyConvertLimit: number;     // mode reconversions per day
  dailyChatLimit: number;        // chat-notes questions per day (0 if not allowed)
  modes: OutputMode[] | 'all';
  features: TierFeatures;
  // Self-service via Stripe/RevenueCat?
  selfService: boolean;
  // RevenueCat entitlement IDs (must match dashboard)
  revenueCatEntitlement?: string;
  // Stripe price IDs are looked up server-side via env vars
}

export const FREE_MODES: OutputMode[] = ['summary', 'tasks', 'clean_text', 'ideas', 'outline'];

export const PRICING: Record<Tier, TierConfig> = {
  free: {
    id: 'free',
    label: 'Free',
    priceMonthly: 0,
    priceYearly: 0,
    notesPerDay: 2,
    maxDurationSec: 600,            // 10 min
    maxDailyAudioMinutes: 20,
    dailyConvertLimit: 3,           // bajado de 10 a 3 (vector de abuso)
    dailyChatLimit: 0,              // gated
    modes: FREE_MODES,
    selfService: true,
    features: {
      aiChat: false,
      excelExport: false,
      pdfExport: true,
      sharing: false,
      api: false,
      workspaces: false,
      prioritySupport: false,
      mcp: false,
    },
  },
  premium: {
    id: 'premium',
    label: 'Premium',
    priceMonthly: 14.99,
    priceYearly: 149.99,            // 2 meses gratis
    notesPerDay: 50,
    maxDurationSec: 1800,           // 30 min
    maxDailyAudioMinutes: 120,
    dailyConvertLimit: 50,
    dailyChatLimit: 100,
    modes: 'all',
    selfService: true,
    revenueCatEntitlement: 'premium',
    features: {
      aiChat: true,
      excelExport: true,
      pdfExport: true,
      sharing: true,
      api: true,
      workspaces: false,
      prioritySupport: false,
      mcp: false,
    },
  },
  pro_plus: {
    id: 'pro_plus',
    label: 'Pro+',
    priceMonthly: 29.99,
    priceYearly: 299.99,            // ~17% off
    notesPerDay: 200,
    maxDurationSec: 3600,           // 60 min
    maxDailyAudioMinutes: 480,      // 8 horas
    dailyConvertLimit: 200,
    dailyChatLimit: 500,
    modes: 'all',
    selfService: true,
    revenueCatEntitlement: 'pro_plus',
    features: {
      aiChat: true,
      excelExport: true,
      pdfExport: true,
      sharing: true,
      api: true,
      workspaces: false,
      prioritySupport: true,
      mcp: false,
    },
  },
  enterprise: {
    id: 'enterprise',
    label: 'Enterprise',
    priceMonthly: -1,               // custom
    priceYearly: -1,                // custom
    notesPerDay: Number.POSITIVE_INFINITY,
    maxDurationSec: 7200,           // 2h por nota
    maxDailyAudioMinutes: Number.POSITIVE_INFINITY,
    dailyConvertLimit: Number.POSITIVE_INFINITY,
    dailyChatLimit: Number.POSITIVE_INFINITY,
    modes: 'all',
    selfService: false,             // ← custom onboarding
    features: {
      aiChat: true,
      excelExport: true,
      pdfExport: true,
      sharing: true,
      api: true,
      workspaces: true,
      prioritySupport: true,
      mcp: true,
    },
  },
};

export function getTier(tier: Tier): TierConfig {
  return PRICING[tier];
}

export function tierHasMode(tier: Tier, mode: OutputMode): boolean {
  const cfg = PRICING[tier];
  return cfg.modes === 'all' || cfg.modes.includes(mode);
}

export function tierHasFeature(tier: Tier, feature: keyof TierFeatures): boolean {
  return PRICING[tier].features[feature];
}

export function formatPrice(amount: number, interval: Interval = 'month'): string {
  if (amount < 0) return 'Personalizado';
  if (amount === 0) return 'Gratis';
  const suffix = interval === 'year' ? '/año' : '/mes';
  return `$${amount.toFixed(2)}${suffix}`;
}

export function yearlySavings(tier: Tier): number {
  const cfg = PRICING[tier];
  if (cfg.priceMonthly < 0 || cfg.priceYearly < 0) return 0;
  return Math.max(0, cfg.priceMonthly * 12 - cfg.priceYearly);
}

/** Tiers que se ofrecen en el paywall in-app (excluye enterprise — solo web/contacto). */
export const PUBLIC_TIERS: Tier[] = ['free', 'premium', 'pro_plus'];

/** Copy used in paywall + landing pricing card. */
export const PRICING_COPY = {
  premium: {
    title: 'Saca todo de tu voz',
    subtitle: 'Hasta 50 notas/día, 9 modos, exportación profesional y chat con IA.',
    cta: 'Empezar Premium',
  },
  pro_plus: {
    title: 'Para profesionales que graban diario',
    subtitle: 'Hasta 200 notas/día, 8 horas de audio diarias, soporte prioritario.',
    cta: 'Subir a Pro+',
  },
  enterprise: {
    title: 'Para equipos de 5+ personas',
    subtitle: 'Workspaces, MCP, API ilimitada. Precio personalizado por equipo.',
    cta: 'Contactar ventas',
  },
} as const;
