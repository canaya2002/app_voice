# Sythio — Billing architecture

Last updated: 2026-04-27

## Two providers, one source of truth

Sythio bills users through two providers:

| Provider | Platform | When |
|----------|----------|------|
| **RevenueCat** | iOS, Android | App Store / Play Store purchase |
| **Stripe**     | Web | sythio.app dashboard subscription |

Both providers write into the same `subscriptions` table, distinguished by the `provider` column. The application reads `profiles.plan` for fast tier checks; `subscriptions` is the authoritative billing record.

## Why two providers (and not one)

- **App Store / Play Store policies** mandate that digital subscriptions purchased on a mobile device go through their billing systems (RevenueCat is the abstraction layer over both).
- **Web users** prefer card-on-file via Stripe — no platform tax, instant management, easy team billing for Enterprise.
- Forcing all web users through the iOS purchase flow would lose us 30% of revenue and exclude Android-only users from web purchases.

## Subscriptions do NOT transfer between platforms

A user paying via RevenueCat on iOS keeps that subscription on iOS. If the same user signs up on the web via Stripe, that's a separate billing record. We do not attempt to merge them.

**Reasoning:**

1. Apple/Google do not offer a refund-and-port API; we'd be eating duplicate charges.
2. Refund flows differ wildly between providers — one source of truth per provider keeps support simple.
3. The user's tier in `profiles.plan` reflects whichever provider currently has an active subscription. If both are active simultaneously (rare), the most recent webhook wins.

## What the UI shows

- **Mobile (Paywall)**: only shows RevenueCat purchase. If the user already has a Stripe subscription on web, the paywall shows "You already have an active web subscription. Manage it on sythio.app."
- **Web (Settings)**: only shows Stripe checkout. If the user already has a RevenueCat subscription on iOS/Android, web settings show "You're subscribed via the [iOS/Android] app. Manage it from your device."
- This UX is enforced by `getUserPlatforms()` and `canManageSubscription()` in `web/src/lib/subscription.ts`.

## Webhook flow

```
RevenueCat → /functions/v1/revenuecat-webhook → upsert subscriptions (provider='revenuecat') → update profiles.plan
Stripe     → /functions/v1/stripe-webhook     → upsert subscriptions (provider='stripe')     → update profiles.plan
```

Both webhooks verify their respective signatures (RevenueCat header + shared secret; Stripe `stripe-signature` header).

## Pricing v2 (effective 2026-04-27)

| Tier | Price | Source of truth |
|------|-------|-----------------|
| Free | $0 | `lib/pricing.ts` |
| Premium | $14.99/mo · $149.99/yr | `lib/pricing.ts` + RevenueCat dashboard + Stripe price IDs |
| Enterprise | $29.99/mo · $299.99/yr | `lib/pricing.ts` + RevenueCat dashboard + Stripe price IDs |

When pricing changes, update three places in lockstep:

1. `lib/pricing.ts` — client + display.
2. `supabase/functions/_shared/pricing.ts` — server-side enforcement.
3. RevenueCat dashboard (mobile) and Stripe dashboard (web) — actual product prices.

If any of those drift, paywalls show stale prices and gates allow/deny the wrong things.
