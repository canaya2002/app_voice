import { useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useAnimatedStyle,
  withSpring,
  useSharedValue,
} from 'react-native-reanimated';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import AnimatedPressable from '@/components/AnimatedPressable';
import { COLORS, useThemeColors } from '@/lib/constants';
import { shadows } from '@/lib/styles';
import { selectionTap } from '@/lib/haptics';

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
// Tab item (animated)
// ---------------------------------------------------------------------------

interface TabItemProps {
  focused: boolean;
  config: TabConfig;
  onPress: () => void;
  onLongPress: () => void;
}

function TabItem({ focused, config, onPress, onLongPress }: TabItemProps) {
  const scale = useSharedValue(focused ? 1 : 0);
  scale.value = withSpring(focused ? 1 : 0, { damping: 20, stiffness: 300 });

  const dotStyle = useAnimatedStyle(() => ({
    opacity: scale.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      onPress={() => {
        selectionTap();
        onPress();
      }}
      style={styles.tabTouchable}
      haptic={false}
      scaleDown={0.92}
      accessibilityLabel={config.label}
    >
      <View style={styles.tabInner}>
        <Ionicons
          name={focused ? config.iconFocused : config.iconDefault}
          size={22}
          color={focused ? COLORS.primary : COLORS.textMuted}
        />
        {focused && (
          <Text style={styles.tabLabel}>{config.label}</Text>
        )}
        <Animated.View style={[styles.tabDot, dotStyle]} />
      </View>
    </AnimatedPressable>
  );
}

// ---------------------------------------------------------------------------
// Custom tab bar
// ---------------------------------------------------------------------------

function CustomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();

  return (
    <View style={[styles.tabBarOuter, { bottom: Math.max(insets.bottom, 8) + 8 }]}>
      <View style={[styles.tabBarContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
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
            />
          );
        })}
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
  // -- Tab bar container ------------------------------------------------------
  tabBarOuter: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    pointerEvents: 'box-none',
  },
  tabBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 20,
    height: 60,
    borderRadius: 20,
    backgroundColor: COLORS.surface,
    paddingHorizontal: 16,
    gap: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },

  // -- Tab item ---------------------------------------------------------------
  tabTouchable: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabInner: {
    width: 56,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabLabel: {
    fontSize: 9,
    fontWeight: '600',
    color: COLORS.primary,
    marginTop: 2,
  },
  tabDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.primaryLight,
    marginTop: 2,
  },
});
