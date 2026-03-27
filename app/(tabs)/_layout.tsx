import { useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
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
import { COLORS, useThemeColors, useIsDark } from '@/lib/constants';

// ---------------------------------------------------------------------------
// Spring config — matches UIKit default spring
// ---------------------------------------------------------------------------
const TAB_SPRING = { mass: 0.6, damping: 15, stiffness: 200 };

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
// Tab item (animated with UIKit springs)
// ---------------------------------------------------------------------------

interface TabItemProps {
  focused: boolean;
  config: TabConfig;
  onPress: () => void;
  onLongPress: () => void;
  tintColor: string;
  mutedColor: string;
}

function TabItem({ focused, config, onPress, onLongPress, tintColor, mutedColor }: TabItemProps) {
  const progress = useSharedValue(focused ? 1 : 0);
  const scaleValue = useSharedValue(1);

  useEffect(() => {
    progress.value = withSpring(focused ? 1 : 0, TAB_SPRING);
  }, [focused, progress]);

  // Pill background
  const pillStyle = useAnimatedStyle(() => ({
    opacity: progress.value * 0.12,
    transform: [
      { scaleX: 0.8 + progress.value * 0.2 },
      { scaleY: 0.8 + progress.value * 0.2 },
    ],
  }));

  // Icon scale
  const iconContainerStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: 1 + progress.value * 0.1 },
    ],
  }));

  // Label fade
  const labelStyle = useAnimatedStyle(() => ({
    opacity: withTiming(focused ? 1 : 0, { duration: 150, easing: Easing.ease }),
    transform: [
      { translateY: withTiming(focused ? 0 : 4, { duration: 150, easing: Easing.ease }) },
    ],
  }));

  // Press scale
  const pressStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scaleValue.value }],
  }));

  const fireHaptic = () => hapticTabSwitch();
  const firePress = () => onPress();

  const gesture = Gesture.Tap()
    .onBegin(() => {
      scaleValue.value = withSpring(0.92, { damping: 20, stiffness: 400 });
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
          {/* Pill background */}
          <Animated.View
            style={[
              styles.tabPill,
              { backgroundColor: tintColor },
              pillStyle,
            ]}
          />

          {/* Icon */}
          <Animated.View style={iconContainerStyle}>
            <Ionicons
              name={focused ? config.iconFocused : config.iconDefault}
              size={24}
              color={focused ? tintColor : mutedColor}
            />
          </Animated.View>

          {/* Label */}
          <Animated.Text
            style={[
              styles.tabLabel,
              {
                color: tintColor,
                fontWeight: focused ? '500' : '400',
              },
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
// Custom tab bar with BlurView
// ---------------------------------------------------------------------------

function CustomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const isDark = useIsDark();

  const bottomMargin = Math.max(insets.bottom, 8) + 8;

  return (
    <View style={[styles.tabBarOuter, { bottom: bottomMargin }]}>
      <View style={styles.tabBarWrapper}>
        {/* Blur background — iOS native, fallback for Android */}
        {Platform.OS === 'ios' ? (
          <BlurView
            tint={isDark ? 'systemChromeMaterialDark' : 'systemChromeMaterial'}
            intensity={80}
            style={StyleSheet.absoluteFill}
          />
        ) : (
          <View
            style={[
              StyleSheet.absoluteFill,
              {
                backgroundColor: isDark
                  ? 'rgba(26, 26, 26, 0.85)'
                  : 'rgba(255, 255, 255, 0.85)',
              },
            ]}
          />
        )}

        {/* Top border — 0.5px like iOS system separator */}
        <View
          style={[
            styles.topBorder,
            {
              backgroundColor: isDark
                ? 'rgba(255,255,255,0.15)'
                : 'rgba(0,0,0,0.12)',
            },
          ]}
        />

        {/* Tab items */}
        <View style={styles.tabBarContent}>
          {state.routes.map((route, index) => {
            const config = TAB_CONFIG.find((t) => t.name === route.name);
            if (!config) return null;

            const focused = state.index === index;

            const onPress = () => {
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });
              if (!focused && !event.defaultPrevented) {
                navigation.navigate(route.name, route.params);
              }
            };

            const onLongPress = () => {
              navigation.emit({
                type: 'tabLongPress',
                target: route.key,
              });
            };

            return (
              <TabItem
                key={route.key}
                focused={focused}
                config={config}
                onPress={onPress}
                onLongPress={onLongPress}
                tintColor={colors.primary}
                mutedColor={colors.textMuted}
              />
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
    <Tabs
      tabBar={renderTabBar}
      screenOptions={{
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Inicio' }}
      />
      <Tabs.Screen
        name="history"
        options={{ title: 'Historial' }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'Perfil' }}
      />
    </Tabs>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  // -- Tab bar container ---------------------------------------------------
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
    // Native iOS shadow — no elevation
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 16,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  topBorder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    zIndex: 1,
  },
  tabBarContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 8,
  },

  // -- Tab item ------------------------------------------------------------
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
  },
  tabLabel: {
    fontSize: 10,
    marginTop: 2,
    // System font: undefined on iOS = SF Pro
    fontFamily: undefined,
  },
});
