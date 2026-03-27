/**
 * Processing Watcher — Realtime + Polling fallback for note processing.
 *
 * Strategy:
 * 1. Subscribe to Supabase Realtime for instant updates
 * 2. Start polling as fallback (first at 15s, then every 8s)
 * 3. Whichever detects completion first cancels the other
 * 4. Total timeout: 5 minutes → marks as error
 * 5. Realtime reconnect: up to 3 attempts with exponential backoff
 */

import { supabase } from '@/lib/supabase';
import type { Note } from '@/types';

const FIRST_POLL_DELAY_MS = 15_000;
const POLL_INTERVAL_MS = 8_000;
const TOTAL_TIMEOUT_MS = 300_000; // 5 minutes
const MAX_RECONNECT_ATTEMPTS = 3;

type NoteStatus = Note['status'];

export interface ProcessingCallbacks {
  onStatusChange: (status: NoteStatus, errorMessage?: string) => void;
  onComplete: (note: Note) => void;
  onError: (errorMessage: string) => void;
  onElapsedUpdate?: (elapsedSeconds: number) => void;
}

interface WatcherHandle {
  cancel: () => void;
}

function parseNoteRow(row: Record<string, unknown>): Note {
  return {
    ...(row as unknown as Note),
    key_points: Array.isArray(row.key_points) ? row.key_points as string[] : [],
    tasks: Array.isArray(row.tasks) ? row.tasks as string[] : [],
    segments: Array.isArray(row.segments) ? row.segments as Note['segments'] : [],
    speakers: Array.isArray(row.speakers) ? row.speakers as Note['speakers'] : [],
    speakers_detected: typeof row.speakers_detected === 'number' ? row.speakers_detected : 1,
    is_conversation: !!row.is_conversation,
    primary_mode: (row.primary_mode as Note['primary_mode']) ?? 'summary',
    template: row.template as Note['template'],
    retry_count: typeof row.retry_count === 'number' ? row.retry_count : 0,
  };
}

export function watchNoteProcessing(
  noteId: string,
  callbacks: ProcessingCallbacks,
): WatcherHandle {
  let cancelled = false;
  let pollTimer: ReturnType<typeof setTimeout> | null = null;
  let pollInterval: ReturnType<typeof setInterval> | null = null;
  let timeoutTimer: ReturnType<typeof setTimeout> | null = null;
  let elapsedTimer: ReturnType<typeof setInterval> | null = null;
  let channel: ReturnType<typeof supabase.channel> | null = null;
  let reconnectAttempts = 0;

  const startTime = Date.now();

  // ── Cleanup everything ──
  function cleanup() {
    cancelled = true;
    if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
    if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
    if (timeoutTimer) { clearTimeout(timeoutTimer); timeoutTimer = null; }
    if (elapsedTimer) { clearInterval(elapsedTimer); elapsedTimer = null; }
    if (channel) { supabase.removeChannel(channel); channel = null; }
  }

  // ── Handle a terminal status ──
  function handleTerminal(note: Note) {
    if (cancelled) return;
    if (note.status === 'done') {
      cleanup();
      callbacks.onComplete(note);
    } else if (note.status === 'error') {
      cleanup();
      callbacks.onError(note.error_message ?? 'Error desconocido');
    }
  }

  // ── Poll: fetch note directly ──
  async function pollOnce() {
    if (cancelled) return;
    try {
      const { data, error } = await supabase
        .from('notes')
        .select('*')
        .eq('id', noteId)
        .single();

      if (error || !data) return; // silently retry next interval
      const note = parseNoteRow(data as Record<string, unknown>);

      if (!cancelled) {
        callbacks.onStatusChange(note.status, note.error_message);
      }

      if (note.status === 'done' || note.status === 'error') {
        handleTerminal(note);
      }
    } catch {
      // Network error — polling will retry on next interval
    }
  }

  // ── Start polling (fallback) ──
  function startPolling() {
    if (cancelled) return;

    // First poll after delay
    pollTimer = setTimeout(() => {
      if (cancelled) return;
      pollOnce();

      // Then regular interval
      pollInterval = setInterval(() => {
        if (cancelled) return;
        pollOnce();
      }, POLL_INTERVAL_MS);
    }, FIRST_POLL_DELAY_MS);
  }

  // ── Start Realtime ──
  function startRealtime() {
    if (cancelled) return;

    channel = supabase
      .channel(`watcher-${noteId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notes',
          filter: `id=eq.${noteId}`,
        },
        (payload) => {
          if (cancelled) return;
          const note = parseNoteRow(payload.new as Record<string, unknown>);
          callbacks.onStatusChange(note.status, note.error_message);

          if (note.status === 'done' || note.status === 'error') {
            handleTerminal(note);
          }
        },
      )
      .subscribe((status) => {
        if (cancelled) return;

        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          // Attempt reconnect with exponential backoff
          if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
            reconnectAttempts++;
            const backoff = Math.min(1000 * Math.pow(2, reconnectAttempts), 16000);
            if (__DEV__) console.log(`[watcher] Realtime disconnected, reconnecting in ${backoff}ms (attempt ${reconnectAttempts})`);

            if (channel) { supabase.removeChannel(channel); channel = null; }
            setTimeout(() => {
              if (!cancelled) startRealtime();
            }, backoff);
          } else {
            if (__DEV__) console.log('[watcher] Realtime max reconnect attempts reached, relying on polling');
            if (channel) { supabase.removeChannel(channel); channel = null; }
          }
        }
      });
  }

  // ── Elapsed timer (every second) ──
  if (callbacks.onElapsedUpdate) {
    elapsedTimer = setInterval(() => {
      if (cancelled) return;
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      callbacks.onElapsedUpdate?.(elapsed);
    }, 1000);
  }

  // ── Total timeout ──
  timeoutTimer = setTimeout(async () => {
    if (cancelled) return;
    cleanup();

    // Mark note as error in DB
    try {
      await supabase
        .from('notes')
        .update({ status: 'error', error_message: 'El procesamiento tardó demasiado. Intenta de nuevo.' })
        .eq('id', noteId);
    } catch { /* best effort */ }

    callbacks.onError('El procesamiento tardó demasiado. Intenta de nuevo.');
  }, TOTAL_TIMEOUT_MS);

  // ── Start both systems ──
  startRealtime();
  startPolling();

  return { cancel: cleanup };
}
