/**
 * Sythio Push Notifications — Scaffolding for post-launch.
 *
 * Registers for push notifications and saves the Expo Push Token
 * to the user's profile. Does NOT send any notifications (that's backend).
 */

import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { supabase } from '@/lib/supabase';

/**
 * Register for push notifications and save the token to profiles.push_token.
 *
 * Call after the user is logged in. Only runs on physical iOS devices.
 * Returns the push token or null if permission denied / unavailable.
 */
export async function registerForPushNotifications(userId: string): Promise<string | null> {
  // Only register on physical iOS devices (not simulator, not Android for now)
  if (Platform.OS !== 'ios' || !Device.isDevice) {
    return null;
  }

  try {
    // Check existing permission
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    // Request permission if not determined
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      return null;
    }

    // Get Expo Push Token
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: undefined, // Uses the projectId from app.json automatically
    });
    const token = tokenData.data;

    // Save to profiles table
    await supabase
      .from('profiles')
      .update({ push_token: token })
      .eq('id', userId);

    return token;
  } catch (err) {
    if (__DEV__) console.warn('[notifications] Registration failed:', err);
    return null;
  }
}
