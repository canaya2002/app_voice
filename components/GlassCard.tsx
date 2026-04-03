import { type ReactNode } from 'react';
import { View, StyleSheet, Platform, type ViewStyle, type StyleProp } from 'react-native';
import { BlurView } from 'expo-blur';
import { COLORS } from '@/lib/constants';

interface GlassCardProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  intensity?: number;
}

export default function GlassCard({ children, style, intensity = 60 }: GlassCardProps) {
  if (Platform.OS === 'web') {
    return (
      <View style={[styles.fallback, style]}>
        {children}
      </View>
    );
  }

  return (
    <View style={[styles.outer, style]}>
      <BlurView intensity={intensity} tint="light" style={styles.blur}>
        <View style={styles.inner}>
          {children}
        </View>
      </BlurView>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.14,
    shadowRadius: 30,
    elevation: 10,
  },
  blur: {
    flex: 1,
  },
  inner: {
    flex: 1,
  },
  fallback: {
    borderRadius: 22,
    backgroundColor: `${COLORS.surface}E8`,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.14,
    shadowRadius: 30,
    elevation: 10,
  },
});
