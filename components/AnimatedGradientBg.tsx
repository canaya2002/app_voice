import { useEffect } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
  Easing,
  interpolate,
} from 'react-native-reanimated';

const { width: SW, height: SH } = Dimensions.get('window');

/* ─── Blob config ──────────────────────────────────────── */

interface Blob {
  color: string;
  size: number;
  x: number;
  y: number;
  dx: number;        // horizontal travel distance
  dy: number;        // vertical travel distance
  moveDur: number;   // movement cycle (ms)
  rotDur: number;    // rotation cycle (ms)
  delay: number;
  scaleRange: [number, number];
  scaleDur: number;
}

const BLOBS: Blob[] = [
  {
    color: 'rgba(255, 0, 180, 0.55)',
    size: SW * 1.1,
    x: -SW * 0.25,
    y: -SH * 0.12,
    dx: SW * 0.35,
    dy: SH * 0.18,
    moveDur: 8000,
    rotDur: 17000,
    delay: 0,
    scaleRange: [0.85, 1.15],
    scaleDur: 7000,
  },
  {
    color: 'rgba(0, 210, 255, 0.5)',
    size: SW * 1.0,
    x: SW * 0.15,
    y: SH * 0.18,
    dx: -SW * 0.3,
    dy: SH * 0.22,
    moveDur: 12000,
    rotDur: 12000,
    delay: 600,
    scaleRange: [0.9, 1.2],
    scaleDur: 9000,
  },
  {
    color: 'rgba(100, 0, 255, 0.5)',
    size: SW * 1.05,
    x: -SW * 0.1,
    y: SH * 0.42,
    dx: SW * 0.4,
    dy: -SH * 0.15,
    moveDur: 10000,
    rotDur: 20000,
    delay: 1200,
    scaleRange: [0.8, 1.1],
    scaleDur: 11000,
  },
  {
    color: 'rgba(0, 255, 120, 0.35)',
    size: SW * 0.85,
    x: SW * 0.3,
    y: SH * 0.6,
    dx: -SW * 0.25,
    dy: -SH * 0.2,
    moveDur: 11000,
    rotDur: 25000,
    delay: 400,
    scaleRange: [0.9, 1.15],
    scaleDur: 8000,
  },
  {
    color: 'rgba(255, 180, 0, 0.4)',
    size: SW * 0.9,
    x: SW * 0.05,
    y: -SH * 0.05,
    dx: SW * 0.2,
    dy: SH * 0.35,
    moveDur: 14000,
    rotDur: 23000,
    delay: 900,
    scaleRange: [0.85, 1.1],
    scaleDur: 10000,
  },
  {
    color: 'rgba(0, 50, 255, 0.45)',
    size: SW * 0.95,
    x: SW * 0.2,
    y: SH * 0.3,
    dx: -SW * 0.35,
    dy: SH * 0.15,
    moveDur: 9000,
    rotDur: 18000,
    delay: 1500,
    scaleRange: [0.88, 1.12],
    scaleDur: 12000,
  },
];

/* ─── Single animated blob ─────────────────────────────── */

function AnimBlob({ blob }: { blob: Blob }) {
  const move = useSharedValue(0);
  const rot = useSharedValue(0);
  const scale = useSharedValue(0);

  useEffect(() => {
    const ease = Easing.inOut(Easing.sin);

    move.value = withDelay(
      blob.delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: blob.moveDur, easing: ease }),
          withTiming(0, { duration: blob.moveDur, easing: ease }),
        ),
        -1,
        true,
      ),
    );

    rot.value = withDelay(
      blob.delay,
      withRepeat(
        withTiming(360, { duration: blob.rotDur, easing: Easing.linear }),
        -1,
      ),
    );

    scale.value = withDelay(
      blob.delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: blob.scaleDur, easing: ease }),
          withTiming(0, { duration: blob.scaleDur, easing: ease }),
        ),
        -1,
        true,
      ),
    );
  }, [move, rot, scale, blob]);

  const animStyle = useAnimatedStyle(() => {
    const tx = interpolate(move.value, [0, 1], [0, blob.dx]);
    const ty = interpolate(move.value, [0, 1], [0, blob.dy]);
    const s = interpolate(scale.value, [0, 1], blob.scaleRange);

    return {
      transform: [
        { translateX: tx },
        { translateY: ty },
        { rotate: `${rot.value}deg` },
        { scale: s },
      ],
    };
  });

  const half = blob.size / 2;

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: blob.x,
          top: blob.y,
          width: blob.size,
          height: blob.size,
          borderRadius: half,
          backgroundColor: blob.color,
        },
        animStyle,
      ]}
    />
  );
}

/* ─── Main component ───────────────────────────────────── */

export default function AnimatedGradientBg() {
  return (
    <View style={styles.wrap} pointerEvents="none">
      {BLOBS.map((b, i) => (
        <AnimBlob key={i} blob={b} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#050510',
    overflow: 'hidden',
  },
});
