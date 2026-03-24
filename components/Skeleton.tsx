import { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, type ViewStyle } from 'react-native';
import { COLORS } from '@/lib/constants';

interface SkeletonProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
}

function SkeletonBox({ width = '100%', height = 16, borderRadius = 8, style }: SkeletonProps) {
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(shimmer, {
          toValue: 0,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [shimmer]);

  const opacity = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.7],
  });

  return (
    <Animated.View
      style={[
        {
          width: width as number,
          height,
          borderRadius,
          backgroundColor: COLORS.border,
          opacity,
        },
        style,
      ]}
    />
  );
}

export function NoteCardSkeleton() {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <SkeletonBox width="65%" height={18} />
        <SkeletonBox width={60} height={22} borderRadius={11} />
      </View>
      <SkeletonBox width="90%" height={14} style={{ marginTop: 10 }} />
      <SkeletonBox width="70%" height={14} style={{ marginTop: 6 }} />
      <View style={styles.footer}>
        <SkeletonBox width={80} height={12} />
        <SkeletonBox width={50} height={12} />
      </View>
    </View>
  );
}

export function NoteCardSkeletonList({ count = 5 }: { count?: number }) {
  return (
    <View style={styles.list}>
      {Array.from({ length: count }).map((_, i) => (
        <NoteCardSkeleton key={i} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  list: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
});
