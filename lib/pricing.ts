/**
 * Sythio pricing — single source of truth.
 *
 * Mobile billing: RevenueCat (iOS/Android). Configure these entitlement IDs
 * in the RevenueCat dashboard to match the keys below.
 *
 * Web billing: Stripe Checkout. Price IDs are read from environment variables
 * on the edge function side (`STRIPE_PRICE_*`).
 *
 * Decision: subscriptions DO NOT transfer between platforms. A user paying via
 * RevenueCat on iOS keeps that subscription on iOS; if they sign up on the web
 * via Stripe, that's a separate billing record. See docs/billing-architecture.md.
 */

import type { OutputMode } from '@/types';

export type Tier = 'free' | 'premium' | 'enterprise';
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
  priceMonthly: number;
  priceYearly: number;
  notesPerDay: number;          // Infinity for unlimited
  maxDurationSec: number;
  modes: OutputMode[] | 'all';
  features: TierFeatures;
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
    modes: FREE_MODES,
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
    notesPerDay: Infinity,
    maxDurationSec: 1800,           // 30 min
    modes: 'all',
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
    revenueCatEntitlement: 'premium',
  },
  enterprise: {
    id: 'enterprise',
    label: 'Enterprise',
    priceMonthly: 29.99,
    priceYearly: 299.99,
    notesPerDay: Infinity,
    maxDurationSec: 3600,           // 60 min
    modes: 'all',
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
    revenueCatEntitlement: 'enterprise',
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
  if (amount === 0) return 'Gratis';
  const suffix = interval === 'year' ? '/año' : '/mes';
  return `$${amount.toFixed(2)}${suffix}`;
}

export function yearlySavings(tier: Tier): number {
  const cfg = PRICING[tier];
  return Math.max(0, cfg.priceMonthly * 12 - cfg.priceYearly);
}

/** Copy used in paywall + landing pricing card. */
export const PRICING_COPY = {
  premium: {
    title: 'Saca todo de tu voz',
    subtitle: 'Notas ilimitadas, los 9 modos, exportación profesional y chat con IA.',
    cta: 'Empezar Premium',
  },
  enterprise: {
    title: 'Para equipos que decidieron acelerar',
    subtitle: 'Todo lo de Premium más workspaces, API ilimitada y MCP.',
    cta: 'Subir a Enterprise',
  },
} as const;
