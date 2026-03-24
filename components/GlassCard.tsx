import { type ReactNode } from 'react';
import { View, StyleSheet, Platform, type ViewStyle, type StyleProp } from 'react-native';
import { BlurView } from 'expo-blur';
import { COLORS } from '@/lib/constants';

interface GlassCardProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  intensity?: number;
}

export default function GlassCard({ children, style, intensity = 50 }: GlassCardProps) {
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
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.18)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 8,
  },
  blur: {
    flex: 1,
  },
  inner: {
    flex: 1,
  },
  fallback: {
    borderRadius: 20,
    backgroundColor: `${COLORS.surface}E6`,
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.18)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 8,
  },
});
