import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase config. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.'
  );
}

if (!supabaseUrl.startsWith('https://')) {
  throw new Error('EXPO_PUBLIC_SUPABASE_URL must use HTTPS.');
}

const customStorage = {
  getItem: async (key: string): Promise<string | null> => {
    if (typeof window === 'undefined') return null;
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    return AsyncStorage.getItem(key);
  },
  setItem: async (key: string, value: string): Promise<void> => {
    if (typeof window === 'undefined') return;
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    await AsyncStorage.setItem(key, value);
  },
  removeItem: async (key: string): Promise<void> => {
    if (typeof window === 'undefined') return;
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    await AsyncStorage.removeItem(key);
  },
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: customStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
