import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Slot, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore } from '@/stores/authStore';
import { useThemeStore } from '@/stores/themeStore';
import { useIsDark } from '@/lib/constants';
import { configurePurchases, checkPremiumEntitlement, onCustomerInfoUpdated } from '@/lib/purchases';
import ToastProvider from '@/components/Toast';
import { ErrorBoundary } from '@/components/ErrorBoundary';

const ONBOARDING_KEY = 'sythio_onboarding_done';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const { session, loading, initialize } = useAuthStore();
  const [onboardingDone, setOnboardingDone] = useState<boolean | null>(null);
  const router = useRouter();
  const segments = useSegments();

  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  const isDark = useIsDark();

  // 1. Initialize auth + theme + purchases + read onboarding flag
  useEffect(() => {
    initialize();
    useThemeStore.getState().initialize();

    // Initialize RevenueCat and sync premium status
    configurePurchases().then(() => {
      checkPremiumEntitlement().then((isPremium) => {
        const currentPlan = useAuthStore.getState().user?.plan;
        if (isPremium && currentPlan !== 'premium') {
          useAuthStore.getState().setPlan('premium');
        }
      });
    });

    // Listen for entitlement changes (renewal, expiry, etc.)
    const unsubPurchases = onCustomerInfoUpdated((isPremium) => {
      useAuthStore.getState().setPlan(isPremium ? 'premium' : 'free');
    });

    AsyncStorage.getItem(ONBOARDING_KEY).then((val) => {
      const done = val === 'true';
      if (__DEV__) console.log('[layout] onboarding flag:', done);
      setOnboardingDone(done);
    });

    return () => { unsubPurchases(); };
  }, [initialize]);

  // 2. Hide splash once both are ready
  useEffect(() => {
    if (!loading && onboardingDone !== null && fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [loading, onboardingDone, fontsLoaded]);

  // 3. Navigation guard
  useEffect(() => {
    if (loading || onboardingDone === null) return;

    const navigate = async () => {
      let done = onboardingDone;

      // Re-verify from storage to avoid stale state after onboarding completes
      if (!done) {
        const val = await AsyncStorage.getItem(ONBOARDING_KEY);
        if (val === 'true') {
          setOnboardingDone(true);
          return; // Will re-trigger with updated state
        }
      }

      const inAuthGroup = segments[0] === '(auth)';
      const inTabsGroup = segments[0] === '(tabs)';

      if (__DEV__) {
        console.log('[layout] session:', !!session, 'onboarding:', done, 'segments:', segments);
      }

      if (!done) {
        if (segments[1] !== 'onboarding') {
          router.replace('/(auth)/onboarding');
        }
      } else if (!session) {
        if (!inAuthGroup || segments[1] === 'onboarding') {
          router.replace('/(auth)/login');
        }
      } else {
        if (!inTabsGroup) {
          router.replace('/(tabs)');
        }
      }
    };

    navigate();
  }, [session, loading, onboardingDone, segments, router]);

  if (loading || onboardingDone === null || !fontsLoaded) {
    return null;
  }

  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={styles.root}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <Slot />
        <ToastProvider />
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
