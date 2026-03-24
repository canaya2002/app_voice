import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Animated,
  LayoutChangeEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS } from '@/lib/constants';
import { selectionTap, successTap } from '@/lib/haptics';
import { showToast } from '@/components/Toast';
import type { Note } from '@/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TabKey = 'summary' | 'keyPoints' | 'tasks' | 'cleanText';

interface TabDef {
  key: TabKey;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}

interface ResultTabsProps {
  note: Note;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TABS: TabDef[] = [
  { key: 'summary', label: 'Resumen', icon: 'document-text-outline' },
  { key: 'keyPoints', label: 'Puntos clave', icon: 'list-outline' },
  { key: 'tasks', label: 'Tareas', icon: 'checkbox-outline' },
  { key: 'cleanText', label: 'Texto limpio', icon: 'reader-outline' },
];

const STAGGER_DELAY = 150;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function storageKey(noteId: string): string {
  return `tasks_${noteId}`;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** A single key-point row that slides in from the right. */
function KeyPointRow({
  text,
  index,
  onPress,
}: {
  text: string;
  index: number;
  onPress: () => void;
}) {
  const translateX = useRef(new Animated.Value(120)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const delay = index * STAGGER_DELAY;
    Animated.parallel([
      Animated.timing(translateX, {
        toValue: 0,
        duration: 350,
        delay,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 350,
        delay,
        useNativeDriver: true,
      }),
    ]).start();
  }, [index, translateX, opacity]);

  return (
    <Animated.View style={{ transform: [{ translateX }], opacity }}>
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={onPress}
        style={styles.keyPointCard}
        accessibilityLabel={`Punto clave: ${text}`}
        accessibilityHint="Toca para copiar"
      >
        <View style={styles.keyPointBullet} />
        <Text style={styles.keyPointText}>{text}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

/** A single task row with animated checkbox. */
function TaskRow({
  text,
  checked,
  onToggle,
}: {
  text: string;
  checked: boolean;
  onToggle: () => void;
}) {
  const checkAnim = useRef(new Animated.Value(checked ? 1 : 0)).current;
  const strikeAnim = useRef(new Animated.Value(checked ? 1 : 0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(checkAnim, {
        toValue: checked ? 1 : 0,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(strikeAnim, {
        toValue: checked ? 1 : 0,
        duration: 250,
        useNativeDriver: false, // color & textDecoration need JS driver
      }),
    ]).start();
  }, [checked, checkAnim, strikeAnim]);

  const textColor = strikeAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [COLORS.textPrimary, COLORS.textMuted],
  });

  return (
    <TouchableOpacity
      style={styles.taskRow}
      activeOpacity={0.7}
      onPress={onToggle}
      accessibilityLabel={`Tarea: ${text}`}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
    >
      <View style={styles.checkboxOuter}>
        {/* unchecked square */}
        <Animated.View
          style={[
            styles.checkboxInner,
            {
              backgroundColor: checked ? COLORS.primary : 'transparent',
              borderColor: checked ? COLORS.primary : COLORS.textMuted,
            },
          ]}
        >
          <Animated.View style={{ opacity: checkAnim }}>
            <Ionicons name="checkmark" size={14} color="#FFF" />
          </Animated.View>
        </Animated.View>
      </View>

      <Animated.Text
        style={[
          styles.taskText,
          { color: textColor },
          checked && styles.taskTextStrike,
        ]}
      >
        {text}
      </Animated.Text>
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function ResultTabs({ note }: ResultTabsProps) {
  // ---- state ----
  const [activeTab, setActiveTab] = useState<TabKey>('summary');
  const [checkedTasks, setCheckedTasks] = useState<Set<number>>(new Set());
  const [tasksLoaded, setTasksLoaded] = useState(false);

  // ---- indicator animation ----
  const tabLayouts = useRef<Record<string, { x: number; width: number }>>({});
  const indicatorLeft = useRef(new Animated.Value(0)).current;
  const indicatorWidth = useRef(new Animated.Value(0)).current;

  // ---- content fade ----
  const contentOpacity = useRef(new Animated.Value(1)).current;

  // ---- persist / restore tasks ----
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(storageKey(note.id))
      .then((raw) => {
        if (cancelled) return;
        if (raw != null) {
          try {
            const arr: number[] = JSON.parse(raw);
            setCheckedTasks(new Set(arr));
          } catch {
            // corrupted — ignore
          }
        }
        setTasksLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setTasksLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [note.id]);

  // save whenever checkedTasks changes (only after initial load)
  useEffect(() => {
    if (!tasksLoaded) return;
    AsyncStorage.setItem(
      storageKey(note.id),
      JSON.stringify(Array.from(checkedTasks)),
    ).catch(() => {});
  }, [checkedTasks, note.id, tasksLoaded]);

  // ---- helpers ----
  const moveIndicator = useCallback(
    (key: string) => {
      const layout = tabLayouts.current[key];
      if (!layout) return;
      Animated.parallel([
        Animated.spring(indicatorLeft, {
          toValue: layout.x,
          useNativeDriver: false,
          tension: 120,
          friction: 14,
        }),
        Animated.spring(indicatorWidth, {
          toValue: layout.width,
          useNativeDriver: false,
          tension: 120,
          friction: 14,
        }),
      ]).start();
    },
    [indicatorLeft, indicatorWidth],
  );

  const handleTabPress = useCallback(
    (key: TabKey) => {
      if (key === activeTab) return;
      selectionTap();
      // fade out, switch, fade in
      Animated.timing(contentOpacity, {
        toValue: 0,
        duration: 120,
        useNativeDriver: true,
      }).start(() => {
        setActiveTab(key);
        moveIndicator(key);
        Animated.timing(contentOpacity, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }).start();
      });
    },
    [activeTab, contentOpacity, moveIndicator],
  );

  const handleTabLayout = useCallback(
    (key: string, e: LayoutChangeEvent) => {
      const { x, width } = e.nativeEvent.layout;
      tabLayouts.current[key] = { x, width };
      // initialise the indicator on the first tab
      if (key === activeTab) {
        indicatorLeft.setValue(x);
        indicatorWidth.setValue(width);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const toggleTask = useCallback(
    (index: number) => {
      selectionTap();
      setCheckedTasks((prev) => {
        const next = new Set(prev);
        if (next.has(index)) {
          next.delete(index);
        } else {
          next.add(index);
        }
        return next;
      });
    },
    [],
  );

  const copyPoint = useCallback(async (text: string) => {
    await Clipboard.setStringAsync(text);
    successTap();
    showToast('Punto copiado', 'success');
  }, []);

  const copyCleanText = useCallback(async () => {
    const txt = note.clean_text || '';
    if (!txt) return;
    await Clipboard.setStringAsync(txt);
    successTap();
    showToast('Texto copiado', 'success');
  }, [note.clean_text]);

  // ---- computed ----
  const completedCount = checkedTasks.size;
  const totalTasks = note.tasks.length;

  // ---- render helpers ----
  const renderContent = () => {
    switch (activeTab) {
      // ------------------------------------------------------------------ //
      // RESUMEN
      // ------------------------------------------------------------------ //
      case 'summary':
        return (
          <View style={styles.summaryCard}>
            <Ionicons
              name="document-text"
              size={22}
              color={COLORS.primary}
              style={styles.summaryIcon}
            />
            <Text style={styles.summaryText}>
              {note.summary || 'Sin resumen disponible.'}
            </Text>
          </View>
        );

      // ------------------------------------------------------------------ //
      // PUNTOS CLAVE
      // ------------------------------------------------------------------ //
      case 'keyPoints':
        if (note.key_points.length === 0) {
          return (
            <Text style={styles.emptyText}>
              No se encontraron puntos clave.
            </Text>
          );
        }
        return (
          <View style={styles.listContainer}>
            {note.key_points.map((point, idx) => (
              <KeyPointRow
                key={idx}
                text={point}
                index={idx}
                onPress={() => copyPoint(point)}
              />
            ))}
          </View>
        );

      // ------------------------------------------------------------------ //
      // TAREAS
      // ------------------------------------------------------------------ //
      case 'tasks':
        if (totalTasks === 0) {
          return (
            <Text style={styles.emptyText}>
              No se detectaron tareas pendientes.
            </Text>
          );
        }
        return (
          <View style={styles.listContainer}>
            {/* counter */}
            <View style={styles.taskCounter}>
              <Text style={styles.taskCounterText}>
                {completedCount} de {totalTasks} completada
                {totalTasks === 1 ? '' : 's'}
              </Text>
              <View style={styles.taskProgressTrack}>
                <View
                  style={[
                    styles.taskProgressFill,
                    {
                      width:
                        totalTasks > 0
                          ? `${(completedCount / totalTasks) * 100}%`
                          : '0%',
                    },
                  ]}
                />
              </View>
            </View>

            {/* list */}
            {note.tasks.map((task, idx) => (
              <TaskRow
                key={idx}
                text={task}
                checked={checkedTasks.has(idx)}
                onToggle={() => toggleTask(idx)}
              />
            ))}
          </View>
        );

      // ------------------------------------------------------------------ //
      // TEXTO LIMPIO
      // ------------------------------------------------------------------ //
      case 'cleanText':
        return (
          <View style={styles.cleanTextWrapper}>
            <Text style={styles.cleanTextContent}>
              {note.clean_text || 'Sin texto limpio disponible.'}
            </Text>
            {/* spacer so text doesn't hide behind floating button */}
            <View style={{ height: 72 }} />
          </View>
        );
    }
  };

  // ---- main render ----
  return (
    <View style={styles.container}>
      {/* ---- tab bar ---- */}
      <View style={styles.tabBarWrapper}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabBarContent}
        >
          <View style={styles.tabBarInner}>
            {TABS.map((tab) => {
              const isActive = activeTab === tab.key;
              return (
                <TouchableOpacity
                  key={tab.key}
                  activeOpacity={0.7}
                  onPress={() => handleTabPress(tab.key)}
                  onLayout={(e) => handleTabLayout(tab.key, e)}
                  style={styles.tab}
                  accessibilityLabel={tab.label}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: isActive }}
                >
                  <Ionicons
                    name={tab.icon}
                    size={16}
                    color={isActive ? COLORS.primary : COLORS.textMuted}
                  />
                  <Text
                    style={[
                      styles.tabText,
                      isActive && styles.tabTextActive,
                    ]}
                  >
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              );
            })}

            {/* sliding indicator */}
            <Animated.View
              style={[
                styles.indicator,
                {
                  left: indicatorLeft,
                  width: indicatorWidth,
                },
              ]}
            />
          </View>
        </ScrollView>
      </View>

      {/* ---- content ---- */}
      <Animated.View style={[styles.contentOuter, { opacity: contentOpacity }]}>
        <ScrollView
          style={styles.contentScroll}
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator={false}
        >
          {renderContent()}
        </ScrollView>

        {/* floating copy button for clean text */}
        {activeTab === 'cleanText' && note.clean_text ? (
          <TouchableOpacity
            style={styles.floatingCopy}
            activeOpacity={0.8}
            onPress={copyCleanText}
            accessibilityLabel="Copiar todo"
          >
            <Ionicons name="copy-outline" size={18} color="#FFF" />
            <Text style={styles.floatingCopyText}>Copiar todo</Text>
          </TouchableOpacity>
        ) : null}
      </Animated.View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  // ---- tab bar ----
  tabBarWrapper: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  tabBarContent: {
    paddingHorizontal: 16,
  },
  tabBarInner: {
    flexDirection: 'row',
    position: 'relative',
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 6,
  },
  tabText: {
    fontSize: 13,
    color: COLORS.textMuted,
    fontWeight: '500',
  },
  tabTextActive: {
    color: COLORS.primary,
    fontWeight: '700',
  },
  indicator: {
    position: 'absolute',
    bottom: 0,
    height: 3,
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
    backgroundColor: COLORS.primary,
  },

  // ---- content ----
  contentOuter: {
    flex: 1,
  },
  contentScroll: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 32,
  },

  // ---- summary ----
  summaryCard: {
    backgroundColor: COLORS.surfaceAlt,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  summaryIcon: {
    marginBottom: 12,
  },
  summaryText: {
    fontSize: 16,
    lineHeight: 28,
    color: COLORS.textPrimary,
  },

  // ---- key points ----
  listContainer: {
    gap: 12,
  },
  keyPointCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 14,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.primary,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  keyPointBullet: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.primary,
    marginTop: 6,
    marginRight: 12,
  },
  keyPointText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 24,
    color: COLORS.textPrimary,
  },

  // ---- tasks ----
  taskCounter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: COLORS.surfaceAlt,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 4,
  },
  taskCounterText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.primary,
    flexShrink: 0,
  },
  taskProgressTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.borderLight,
    overflow: 'hidden',
  },
  taskProgressFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: COLORS.primary,
  },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 14,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  checkboxOuter: {
    marginTop: 1,
  },
  checkboxInner: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  taskText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 22,
  },
  taskTextStrike: {
    textDecorationLine: 'line-through',
  },

  // ---- clean text ----
  cleanTextWrapper: {
    flex: 1,
  },
  cleanTextContent: {
    fontSize: 16,
    lineHeight: 28,
    color: COLORS.textPrimary,
  },
  floatingCopy: {
    position: 'absolute',
    bottom: 20,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 28,
    shadowColor: COLORS.primaryDark,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
  floatingCopyText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },

  // ---- empty ----
  emptyText: {
    fontSize: 14,
    color: COLORS.textMuted,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 24,
  },
});
