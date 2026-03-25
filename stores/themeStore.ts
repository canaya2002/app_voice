import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

type ThemePreference = 'light' | 'dark' | 'system';

interface ThemeState {
  preference: ThemePreference;
  setPreference: (pref: ThemePreference) => void;
  initialize: () => Promise<void>;
}

const THEME_KEY = 'sythio_theme_preference';

export const useThemeStore = create<ThemeState>((set) => ({
  preference: 'system',
  setPreference: (pref) => {
    set({ preference: pref });
    AsyncStorage.setItem(THEME_KEY, pref).catch(() => {});
  },
  initialize: async () => {
    try {
      const stored = await AsyncStorage.getItem(THEME_KEY);
      if (stored === 'light' || stored === 'dark' || stored === 'system') {
        set({ preference: stored });
      }
    } catch {}
  },
}));
