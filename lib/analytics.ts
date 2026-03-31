/**
 * Sythio Analytics — provider-agnostic event tracking.
 *
 * Currently logs to console in __DEV__ and stores events in Supabase.
 * Swap the `send` implementation for Mixpanel / Amplitude / PostHog
 * when ready, without touching any call sites.
 */

import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';

// ---------------------------------------------------------------------------
// Event catalogue
// ---------------------------------------------------------------------------

export type AnalyticsEvent =
  | 'audio_record_started'
  | 'audio_record_completed'
  | 'audio_uploaded'
  | 'processing_started'
  | 'processing_completed'
  | 'processing_error'
  | 'output_mode_viewed'
  | 'output_mode_generated'
  | 'result_copied'
  | 'result_exported_pdf'
  | 'result_exported_excel'
  | 'result_exported_srt'
  | 'result_shared'
  | 'task_checked'
  | 'task_edited'
  | 'task_deleted'
  | 'task_reordered'
  | 'speaker_renamed'
  | 'note_deleted'
  | 'premium_cta_viewed'
  | 'premium_cta_tapped'
  | 'premium_interest_registered'
  | 'premium_paywall_viewed'
  | 'premium_paywall_dismissed'
  | 'premium_upgrade_tapped'
  | 'premium_restore_tapped'
  | 'purchase_started'
  | 'purchase_completed'
  | 'purchase_cancelled'
  | 'purchase_failed'
  | 'restore_started'
  | 'restore_completed'
  | 'restore_failed'
  | 'premium_unlocked'
  | 'daily_limit_reached'
  | 'upgrade_prompt_shown'
  | 'note_reopened'
  | 'task_revisited'
  | 'data_exported'
  | 'app_opened'
  | 'onboarding_completed'
  | 'note_retry'
  | 'result_exported_docx'
  | 'share_link_created';

type EventProperties = Record<string, string | number | boolean | null>;

// ---------------------------------------------------------------------------
// Core
// ---------------------------------------------------------------------------

let queue: { event: AnalyticsEvent; properties: EventProperties; timestamp: string }[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function getUserId(): string | null {
  return useAuthStore.getState().user?.id ?? null;
}

/**
 * Track an analytics event. Fire-and-forget — never blocks UI.
 */
export function track(event: AnalyticsEvent, properties: EventProperties = {}): void {
  const entry = {
    event,
    properties: { ...properties, user_id: getUserId() },
    timestamp: new Date().toISOString(),
  };

  if (__DEV__) {
    console.log(`[analytics] ${event}`, entry.properties);
  }

  queue.push(entry);

  // Batch-flush every 5 seconds to avoid spamming
  if (!flushTimer) {
    flushTimer = setTimeout(flush, 5000);
  }
}

async function flush(): Promise<void> {
  flushTimer = null;
  if (queue.length === 0) return;

  const batch = [...queue];
  queue = [];

  try {
    await supabase.from('analytics_events').insert(
      batch.map((e) => ({
        user_id: e.properties.user_id as string | null,
        event: e.event,
        properties: e.properties,
        created_at: e.timestamp,
      })),
    );
  } catch {
    // Silently fail — analytics should never crash the app.
    // Re-queue for next flush if desired (omitted to avoid infinite growth).
  }
}

/**
 * Force-flush pending events (call on app background / logout).
 */
export function flushAnalytics(): void {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  flush();
}

// ---------------------------------------------------------------------------
// Convenience helpers
// ---------------------------------------------------------------------------

export function trackModeView(mode: string, noteId: string): void {
  track('output_mode_viewed', { mode, note_id: noteId });
}

export function trackModeGenerated(mode: string, noteId: string): void {
  track('output_mode_generated', { mode, note_id: noteId });
}

export function trackExport(format: 'pdf' | 'excel' | 'copy' | 'share' | 'srt' | 'docx' | 'share_link', mode: string): void {
  const eventMap = {
    pdf: 'result_exported_pdf',
    excel: 'result_exported_excel',
    copy: 'result_copied',
    share: 'result_shared',
    srt: 'result_exported_srt',
    docx: 'result_exported_docx',
    share_link: 'share_link_created',
  } as const;
  track(eventMap[format], { mode });
}
