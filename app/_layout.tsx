import { ErrorBoundary } from "@/components/ErrorBoundary";
import ToastProvider from "@/components/Toast";
import { useIsDark } from "@/lib/constants";
import { registerForPushNotifications } from "@/lib/notifications";
import {
  checkSubscriptionStatus,
  configurePurchases,
  identifyUser,
  onCustomerInfoUpdated,
} from "@/lib/purchases";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/authStore";
import { useThemeStore } from "@/stores/themeStore";
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Linking from "expo-linking";
import { Slot, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen"; /*  */
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { StyleSheet } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";

const ONBOARDING_KEY = "sythio_onboarding_done";

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

    // Initialize RevenueCat, identify user, and sync premium status
    const userId = useAuthStore.getState().session?.user?.id;
    configurePurchases(userId).then(async () => {
      if (userId) await identifyUser(userId);
      const status = await checkSubscriptionStatus();
      const currentPlan = useAuthStore.getState().user?.plan;
      if (status !== currentPlan) {
        useAuthStore.getState().setPlan(status);
      }
    });

    // Listen for entitlement changes (renewal, expiry, etc.)
    const unsubPurchases = onCustomerInfoUpdated((isPremium) => {
      useAuthStore.getState().setPlan(isPremium ? "premium" : "free");
    });

    // Register for push notifications (non-blocking, after auth)
    const currentUserId = useAuthStore.getState().session?.user?.id;
    if (currentUserId) {
      registerForPushNotifications(currentUserId).catch(() => {});
    }

    AsyncStorage.getItem(ONBOARDING_KEY).then((val) => {
      const done = val === "true";
      if (__DEV__) console.log("[layout] onboarding flag:", done);
      setOnboardingDone(done);
    });

    return () => {
      unsubPurchases();
    };
  }, [initialize]);

  // 1b. Handle deep links for auth (email confirmation, password reset)
  useEffect(() => {
    const handleAuthDeepLink = async (url: string) => {
      if (!url.includes("auth-callback")) return;

      // Try hash fragment (implicit flow): ...#access_token=x&refresh_token=y
      const hash = url.split("#")[1];
      if (hash) {
        const params = new URLSearchParams(hash);
        const access_token = params.get("access_token");
        const refresh_token = params.get("refresh_token");
        if (access_token && refresh_token) {
          if (__DEV__)
            console.log("[auth] Setting session from deep link (implicit)");
          await supabase.auth.setSession({ access_token, refresh_token });
          return;
        }
      }

      // Try code parameter (PKCE flow): ...?code=x
      const codeMatch = url.match(/[?&]code=([^&#]+)/);
      if (codeMatch) {
        if (__DEV__)
          console.log("[auth] Exchanging code from deep link (PKCE)");
        await supabase.auth.exchangeCodeForSession(codeMatch[1]);
      }
    };

    // Handle URL that opened the app (cold start)
    Linking.getInitialURL().then((url) => {
      if (url) handleAuthDeepLink(url);
    });

    // Handle URL while app is already open (warm start)
    const subscription = Linking.addEventListener("url", (event) => {
      handleAuthDeepLink(event.url);
    });

    return () => subscription.remove();
  }, []);

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
        if (val === "true") {
          setOnboardingDone(true);
          return; // Will re-trigger with updated state
        }
      }

      const inAuthGroup = segments[0] === "(auth)";
      const inTabsGroup = segments[0] === "(tabs)";

      if (__DEV__) {
        console.log(
          "[layout] session:",
          !!session,
          "onboarding:",
          done,
          "segments:",
          segments,
        );
      }

      if (!done) {
        if (segments[1] !== "onboarding") {
          router.replace("/(auth)/onboarding");
        }
      } else if (!session) {
        if (!inAuthGroup || segments[1] === "onboarding") {
          router.replace("/(auth)/login");
        }
      } else {
        if (!inTabsGroup) {
          router.replace("/(tabs)");
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
        <StatusBar style={isDark ? "light" : "dark"} />
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
