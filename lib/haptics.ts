/**
 * Sythio Haptic Feedback System
 *
 * Named functions for each haptic context — not generic enums.
 * Each function documents WHY that specific feedback type is used,
 * matching Apple's Human Interface Guidelines for haptic design.
 *
 * iOS: Full haptic palette (Impact, Notification, Selection)
 * Android: Simplified — only basic impact and selection that feel good
 */

import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

const isHapticsAvailable = Platform.OS === 'ios' || Platform.OS === 'android';
const isIOS = Platform.OS === 'ios';

// ---------------------------------------------------------------------------
// Recording — escalating intensity mirrors the "weight" of each action
// ---------------------------------------------------------------------------

/** Start recording — Medium: deliberate action, user committed to record */
export function hapticRecordStart() {
  if (!isHapticsAvailable) return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
}

/** Pause recording — Light: minor state toggle, easily reversible */
export function hapticRecordPause() {
  if (!isHapticsAvailable) return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}

/** Resume recording — Light: same weight as pause, symmetric pair */
export function hapticRecordResume() {
  if (!isHapticsAvailable) return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}

/** Stop recording — Heavy: finality, the recording is done and processing starts */
export function hapticRecordStop() {
  if (!isHapticsAvailable) return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
}

/** Processing completed (status=done) — Success notification: positive outcome */
export function hapticProcessingDone() {
  if (!isHapticsAvailable) return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
}

// ---------------------------------------------------------------------------
// Navigation & UI — subtle, frequent interactions
// ---------------------------------------------------------------------------

/** Tab switch — Selection: identical to native iOS tab bar haptic */
export function hapticTabSwitch() {
  if (!isHapticsAvailable) return;
  Haptics.selectionAsync();
}

/** Standard button press (AnimatedPressable default) — Light: common, non-disruptive */
export function hapticButtonPress() {
  if (!isHapticsAvailable) return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}

/** Generic selection (filters, toggles, pickers) — Selection: subtle UI state change */
export function hapticSelection() {
  if (!isHapticsAvailable) return;
  Haptics.selectionAsync();
}

/** Mode change between the 8 output modes — Selection: browsing, not committing */
export function hapticModeChange() {
  if (!isHapticsAvailable) return;
  Haptics.selectionAsync();
}

/** Swipe-to-delete threshold reached on NoteCard — Medium: warning, action is armed */
export function hapticSwipeActivate() {
  if (!isHapticsAvailable) return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
}

/** Confirm delete after swipe — Warning notification: destructive action confirmed */
export function hapticSwipeConfirmDelete() {
  if (!isHapticsAvailable) return;
  if (isIOS) {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  } else {
    // Android Warning notification is unreliable — use medium impact instead
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }
}

/** Long press activated — Heavy: deliberate hold recognized */
export function hapticLongPress() {
  if (!isHapticsAvailable) return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
}

// ---------------------------------------------------------------------------
// Results & Export — positive feedback for completed actions
// ---------------------------------------------------------------------------

/** Copy to clipboard — Success notification: content captured */
export function hapticCopyClipboard() {
  if (!isHapticsAvailable) return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
}

/** Export PDF/file generated — Success notification: artifact created */
export function hapticExportSuccess() {
  if (!isHapticsAvailable) return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
}

/** Error in any operation — Error notification: something went wrong */
export function hapticError() {
  if (!isHapticsAvailable) return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
}

// ---------------------------------------------------------------------------
// Tasks — lightweight interactions for checklist-style UI
// ---------------------------------------------------------------------------

/** Check/uncheck task — Light: small, frequent toggle */
export function hapticTaskToggle() {
  if (!isHapticsAvailable) return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}

/** Delete task — Medium: more weight than toggle, less than swipe-delete */
export function hapticTaskDelete() {
  if (!isHapticsAvailable) return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
}

// ---------------------------------------------------------------------------
// Paywall & Purchases — premium moments deserve premium feedback
// ---------------------------------------------------------------------------

/** Open paywall — Medium: entering a significant context */
export function hapticPaywallOpen() {
  if (!isHapticsAvailable) return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
}

/**
 * Purchase successful — Double Success notification
 * This is the most important moment in the monetization flow.
 * The double tap creates a celebratory "ba-dum" that feels rewarding.
 */
export function hapticPurchaseSuccess() {
  if (!isHapticsAvailable) return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  setTimeout(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, 250);
}

/** Purchase error — Error notification: payment failed */
export function hapticPurchaseError() {
  if (!isHapticsAvailable) return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
}
