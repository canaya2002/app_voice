import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

const isHapticsAvailable = Platform.OS === 'ios' || Platform.OS === 'android';

export function lightTap() {
  if (isHapticsAvailable) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }
}

export function mediumTap() {
  if (isHapticsAvailable) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }
}

export function heavyTap() {
  if (isHapticsAvailable) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  }
}

export function successTap() {
  if (isHapticsAvailable) {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }
}

export function errorTap() {
  if (isHapticsAvailable) {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  }
}

export function selectionTap() {
  if (isHapticsAvailable) {
    Haptics.selectionAsync();
  }
}
