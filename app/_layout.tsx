import { useEffect, useState, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { Slot, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore } from '@/stores/authStore';
import ToastProvider from '@/components/Toast';
import { ErrorBoundary } from '@/components/ErrorBoundary';

const ONBOARDING_KEY = 'voicenotes_onboarding_done';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const { session, loading, initialize } = useAuthStore();
  const [onboardingDone, setOnboardingDone] = useState<boolean | null>(null);
  const router = useRouter();
  const segments = useSegments();

  // 1. Initialize auth + read onboarding flag
  useEffect(() => {
    initialize();
    AsyncStorage.getItem(ONBOARDING_KEY).then((val) => {
      const done = val === 'true';
      if (__DEV__) console.log('[layout] onboarding flag:', done);
      setOnboardingDone(done);
    });
  }, [initialize]);

  // 2. Hide splash once both are ready
  useEffect(() => {
    if (!loading && onboardingDone !== null) {
      SplashScreen.hideAsync();
    }
  }, [loading, onboardingDone]);

  // 3. Navigation guard — runs after layout is mounted and state is known
  useEffect(() => {
    if (loading || onboardingDone === null) return;

    const inAuthGroup = segments[0] === '(auth)';
    const inTabsGroup = segments[0] === '(tabs)';

    if (__DEV__) {
      console.log('[layout] session:', !!session, 'onboarding:', onboardingDone, 'segments:', segments);
    }

    if (!onboardingDone) {
      // First time ever — show onboarding
      if (segments[1] !== 'onboarding') {
        router.replace('/(auth)/onboarding');
      }
    } else if (!session) {
      // Onboarding done but not logged in — show login
      if (!inAuthGroup || segments[1] === 'onboarding') {
        router.replace('/(auth)/login');
      }
    } else {
      // Logged in — show tabs
      if (!inTabsGroup) {
        router.replace('/(tabs)');
      }
    }
  }, [session, loading, onboardingDone, segments, router]);

  // Called from onboarding screen to update the flag without re-reading AsyncStorage
  // (onboarding writes it then navigates to login, but we also listen here)
  const checkOnboardingFlag = useCallback(async () => {
    const val = await AsyncStorage.getItem(ONBOARDING_KEY);
    if (val === 'true' && !onboardingDone) {
      setOnboardingDone(true);
    }
  }, [onboardingDone]);

  // Re-check onboarding flag when auth state changes (covers login after onboarding)
  useEffect(() => {
    if (session && !onboardingDone) {
      checkOnboardingFlag();
    }
  }, [session, onboardingDone, checkOnboardingFlag]);

  if (loading || onboardingDone === null) {
    return null;
  }

  return (
    <ErrorBoundary>
      <View style={styles.root}>
        <StatusBar style="dark" />
        <Slot />
        <ToastProvider />
      </View>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
