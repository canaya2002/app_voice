import { useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useAnimatedStyle,
  withSpring,
  withTiming,
  useSharedValue,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { hapticTabSwitch } from '@/lib/haptics';

// ---------------------------------------------------------------------------
// Spring config
// ---------------------------------------------------------------------------
const TAB_SPRING = { damping: 14, stiffness: 180 };
const PRESS_SPRING = { damping: 12, stiffness: 200 };

// ---------------------------------------------------------------------------
// Tab config
// ---------------------------------------------------------------------------

interface TabConfig {
  name: string;
  label: string;
  iconFocused: keyof typeof Ionicons.glyphMap;
  iconDefault: keyof typeof Ionicons.glyphMap;
}

const TAB_CONFIG: TabConfig[] = [
  { name: 'index', label: 'Inicio', iconFocused: 'home', iconDefault: 'home-outline' },
  { name: 'history', label: 'Historial', iconFocused: 'time', iconDefault: 'time-outline' },
  { name: 'profile', label: 'Perfil', iconFocused: 'person', iconDefault: 'person-outline' },
];

// ---------------------------------------------------------------------------
// Tab item
// ---------------------------------------------------------------------------

interface TabItemProps {
  focused: boolean;
  config: TabConfig;
  onPress: () => void;
  onLongPress: () => void;
}

function TabItem({ focused, config, onPress, onLongPress }: TabItemProps) {
  const progress = useSharedValue(focused ? 1 : 0);
  const scaleValue = useSharedValue(1);

  useEffect(() => {
    progress.value = withSpring(focused ? 1 : 0, TAB_SPRING);
  }, [focused, progress]);

  // Pill gradient scale
  const pillStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: 0.7 + progress.value * 0.3 }],
  }));

  // Icon
  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + progress.value * 0.05 }],
  }));

  // Label
  const labelStyle = useAnimatedStyle(() => ({
    opacity: withTiming(focused ? 1 : 0.6, { duration: 150, easing: Easing.ease }),
    transform: [
      { translateY: withTiming(focused ? 0 : 2, { duration: 150, easing: Easing.ease }) },
    ],
  }));

  // Press
  const pressStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scaleValue.value }],
  }));

  const fireHaptic = () => hapticTabSwitch();
  const firePress = () => onPress();

  const gesture = Gesture.Tap()
    .onBegin(() => {
      scaleValue.value = withSpring(0.88, PRESS_SPRING);
    })
    .onFinalize((_e, success) => {
      scaleValue.value = withSpring(1, TAB_SPRING);
      if (success) {
        runOnJS(fireHaptic)();
        runOnJS(firePress)();
      }
    });

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        style={[styles.tabTouchable, pressStyle]}
        accessibilityLabel={config.label}
        accessibilityRole="button"
      >
        <View style={styles.tabInner}>
          {/* Pill gradient background */}
          <Animated.View style={[styles.tabPill, pillStyle]}>
            <LinearGradient
              colors={['#0B0B0B', '#2A2A2A']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.tabPillGradient}
            />
          </Animated.View>

          {/* Icon */}
          <Animated.View style={iconStyle}>
            <Ionicons
              name={focused ? config.iconFocused : config.iconDefault}
              size={22}
              color={focused ? '#FFFFFF' : '#B8BCC4'}
            />
          </Animated.View>

          {/* Label */}
          <Animated.Text
            style={[
              styles.tabLabel,
              { color: focused ? '#0B0B0B' : '#B8BCC4', fontWeight: focused ? '600' : '400' },
              labelStyle,
            ]}
            numberOfLines={1}
          >
            {config.label}
          </Animated.Text>
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

// ---------------------------------------------------------------------------
// Custom tab bar
// ---------------------------------------------------------------------------

function CustomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const bottomMargin = Math.max(insets.bottom, 8) + 8;

  return (
    <View style={[styles.tabBarOuter, { bottom: bottomMargin }]}>
      <View style={styles.tabBarWrapper}>
        {Platform.OS === 'ios' ? (
          <BlurView tint="light" intensity={80} style={StyleSheet.absoluteFill} />
        ) : null}
        <View style={[StyleSheet.absoluteFill, styles.tabBarBg]} />

        {/* Tab items */}
        <View style={styles.tabBarContent}>
          {state.routes.map((route, index) => {
            const config = TAB_CONFIG.find((t) => t.name === route.name);
            if (!config) return null;
            const focused = state.index === index;
            const onPress = () => {
              const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
            };
            const onLongPress = () => { navigation.emit({ type: 'tabLongPress', target: route.key }); };
            return (
              <TabItem key={route.key} focused={focused} config={config} onPress={onPress} onLongPress={onLongPress} />
            );
          })}
        </View>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export default function TabLayout() {
  const renderTabBar = useCallback(
    (props: BottomTabBarProps) => <CustomTabBar {...props} />,
    [],
  );

  return (
    <Tabs tabBar={renderTabBar} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" options={{ title: 'Inicio' }} />
      <Tabs.Screen name="history" options={{ title: 'Historial' }} />
      <Tabs.Screen name="profile" options={{ title: 'Perfil' }} />
    </Tabs>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  tabBarOuter: {
    position: 'absolute',
    left: 16,
    right: 16,
    alignItems: 'center',
    pointerEvents: 'box-none',
  },
  tabBarWrapper: {
    width: '100%',
    height: 64,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.06)',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 16,
      },
      android: { elevation: 12 },
    }),
  },
  tabBarBg: {
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
  },
  tabBarContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 8,
  },
  tabTouchable: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
  },
  tabInner: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
  },
  tabPill: {
    position: 'absolute',
    width: 56,
    height: 36,
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  tabPillGradient: {
    flex: 1,
    borderRadius: 18,
  },
  tabLabel: {
    fontSize: 10,
    marginTop: 2,
  },
});
