import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  Alert,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS } from '@/lib/constants';
import { hapticModeChange, hapticCopyClipboard } from '@/lib/haptics';
import { showToast } from '@/components/Toast';
import { supabase } from '@/lib/supabase';
import type { OutputMode, MessageTone } from '@/types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ModeResultViewProps {
  mode: OutputMode;
  result: Record<string, unknown>;
  noteId: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function asString(val: unknown, fallback = ''): string {
  if (typeof val === 'string') return val;
  if (typeof val === 'number') return String(val);
  return fallback;
}

function asStringArray(val: unknown): string[] {
  if (!Array.isArray(val)) return [];
  return val.filter((v): v is string => typeof v === 'string');
}

function asRecordArray(val: unknown): Record<string, unknown>[] {
  if (!Array.isArray(val)) return [];
  return val.filter(
    (v): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v),
  );
}

function tasksStorageKey(noteId: string): string {
  return `tasks_v2_${noteId}`;
}

async function copyText(text: string, label = 'Texto copiado') {
  await Clipboard.setStringAsync(text);
  hapticCopyClipboard();
  showToast(label, 'success');
}

// ---------------------------------------------------------------------------
// Priority helpers for tasks
// ---------------------------------------------------------------------------

type Priority = 'high' | 'medium' | 'low';

const PRIORITY_ORDER: Priority[] = ['high', 'medium', 'low'];

const PRIORITY_META: Record<Priority, { label: string; color: string }> = {
  high: { label: 'Alta', color: COLORS.error },
  medium: { label: 'Media', color: COLORS.warning },
  low: { label: 'Baja', color: COLORS.success },
};

interface TaskItem {
  text: string;
  priority: Priority;
  responsible: string;
  type: 'explicit' | 'implicit';
  originalIndex: number;
}

function parseTaskItems(raw: unknown): TaskItem[] {
  const arr = asRecordArray(raw);
  return arr.map((item, idx) => {
    const priority = (['high', 'medium', 'low'].includes(asString(item.priority))
      ? asString(item.priority)
      : 'medium') as Priority;
    const type = asString(item.type) === 'implicit' ? 'implicit' : 'explicit';
    return {
      text: asString(item.text) || asString(item.task) || `Tarea ${idx + 1}`,
      priority,
      responsible: asString(item.responsible),
      type,
      originalIndex: idx,
    };
  });
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Reusable section header. */
function SectionHeader({ title, icon }: { title: string; icon?: keyof typeof Ionicons.glyphMap }) {
  return (
    <View style={styles.sectionHeader}>
      {icon && <Ionicons name={icon} size={16} color={COLORS.primary} />}
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

/** A simple card wrapper. */
function Card({ children, highlighted }: { children: React.ReactNode; highlighted?: boolean }) {
  return (
    <View style={[styles.card, highlighted && styles.cardHighlighted]}>
      {children}
    </View>
  );
}

/** Bullet list from string array. */
function BulletList({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <View style={styles.bulletList}>
      {items.map((item, idx) => (
        <View key={idx} style={styles.bulletRow}>
          <View style={styles.bullet} />
          <Text style={styles.bulletText}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

/** Chip row for topics/tags. */
function ChipRow({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <View style={styles.chipRow}>
      {items.map((item, idx) => (
        <View key={idx} style={styles.topicChip}>
          <Text style={styles.topicChipText}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

/** Task checkbox row with persistence. */
function TaskCheckbox({
  task,
  checked,
  onToggle,
  editedText,
  onEdit,
  onDelete,
  onMoveUp,
  onMoveDown,
}: {
  task: TaskItem;
  checked: boolean;
  onToggle: () => void;
  editedText?: string;
  onEdit: (text: string) => void;
  onDelete: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(editedText ?? task.text);
  const displayText = editedText ?? task.text;

  const handleSaveEdit = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== task.text) {
      onEdit(trimmed);
    }
    setEditing(false);
  };

  const handleDelete = () => {
    Alert.alert('Eliminar tarea', '¿Quieres eliminar esta tarea?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: onDelete },
    ]);
  };

  return (
    <View style={styles.taskRow}>
      <TouchableOpacity
        style={styles.checkboxOuter}
        activeOpacity={0.7}
        onPress={onToggle}
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
      >
        <View
          style={[
            styles.checkboxInner,
            {
              backgroundColor: checked ? COLORS.primary : 'transparent',
              borderColor: checked ? COLORS.primary : COLORS.textMuted,
            },
          ]}
        >
          {checked && <Ionicons name="checkmark" size={14} color="#FFF" />}
        </View>
      </TouchableOpacity>

      <View style={styles.taskContent}>
        {editing ? (
          <TextInput
            style={styles.taskEditInput}
            value={draft}
            onChangeText={setDraft}
            onBlur={handleSaveEdit}
            onSubmitEditing={handleSaveEdit}
            autoFocus
            multiline
            returnKeyType="done"
            blurOnSubmit
          />
        ) : (
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => { setDraft(displayText); setEditing(true); }}
          >
            <Text style={[styles.taskText, checked && styles.taskTextChecked]}>
              {displayText}
            </Text>
          </TouchableOpacity>
        )}
        <View style={styles.taskMeta}>
          {task.responsible ? (
            <View style={styles.responsibleChip}>
              <Ionicons name="person-outline" size={10} color={COLORS.primary} />
              <Text style={styles.responsibleText}>{task.responsible}</Text>
            </View>
          ) : null}
          <View
            style={[
              styles.typeBadge,
              { backgroundColor: task.type === 'explicit' ? COLORS.info + '20' : COLORS.warning + '20' },
            ]}
          >
            <Text
              style={[
                styles.typeBadgeText,
                { color: task.type === 'explicit' ? COLORS.info : COLORS.warning },
              ]}
            >
              {task.type === 'explicit' ? 'Explícita' : 'Implícita'}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.taskActions}>
        {onMoveUp && (
          <TouchableOpacity onPress={() => { hapticModeChange(); onMoveUp(); }} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }} style={styles.reorderBtn}>
            <Ionicons name="chevron-up" size={14} color={COLORS.textMuted} />
          </TouchableOpacity>
        )}
        {onMoveDown && (
          <TouchableOpacity onPress={() => { hapticModeChange(); onMoveDown(); }} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }} style={styles.reorderBtn}>
            <Ionicons name="chevron-down" size={14} color={COLORS.textMuted} />
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={styles.taskDeleteBtn}
          onPress={handleDelete}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="close" size={16} color={COLORS.textMuted} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

/** Expandable question row for study mode. */
function QuestionRow({ question, hint }: { question: string; hint: string }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <TouchableOpacity
      style={styles.questionCard}
      activeOpacity={0.7}
      onPress={() => {
        hapticModeChange();
        setExpanded(!expanded);
      }}
    >
      <View style={styles.questionHeader}>
        <Ionicons
          name="help-circle-outline"
          size={18}
          color={COLORS.primary}
        />
        <Text style={styles.questionText}>{question}</Text>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={16}
          color={COLORS.textMuted}
        />
      </View>
      {expanded && hint ? (
        <View style={styles.hintContainer}>
          <Text style={styles.hintText}>{hint}</Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

/** Builds a plain-text version of any mode result for clipboard. */
function buildModeTextForCopy(mode: OutputMode, result: Record<string, unknown>): string {
  const lines: string[] = [];
  switch (mode) {
    case 'summary': {
      lines.push(asString(result.summary));
      const kp = asStringArray(result.key_points);
      if (kp.length) { lines.push('', 'Puntos clave:', ...kp.map((p) => `• ${p}`)); }
      const topics = asStringArray(result.topics);
      if (topics.length) { lines.push('', `Temas: ${topics.join(', ')}`); }
      break;
    }
    case 'tasks': {
      const tasks = asRecordArray(result.tasks);
      tasks.forEach((t, i) => {
        const text = asString(t.text) || asString(t.task) || `Tarea ${i + 1}`;
        const resp = asString(t.responsible);
        lines.push(`☐ ${text}${resp ? ` → ${resp}` : ''}`);
      });
      break;
    }
    case 'action_plan': {
      if (asString(result.objective)) lines.push(`Objetivo: ${asString(result.objective)}`, '');
      asRecordArray(result.steps).forEach((s, i) => {
        lines.push(`${i + 1}. ${asString(s.title) || asString(s.step) || asString(s.action)}`);
        if (asString(s.description)) lines.push(`   ${asString(s.description)}`);
      });
      if (asString(result.next_immediate_step)) lines.push('', `Siguiente paso: ${asString(result.next_immediate_step)}`);
      break;
    }
    case 'executive_report': {
      if (asString(result.context)) lines.push(`Contexto: ${asString(result.context)}`, '');
      if (asString(result.executive_summary)) lines.push(asString(result.executive_summary), '');
      const decisions = asRecordArray(result.decisions);
      if (decisions.length) { lines.push('Decisiones:', ...decisions.map((d) => `• ${asString(d.decision) || asString(d.text)}`)); }
      const pending = asStringArray(result.pending_items);
      if (pending.length) { lines.push('', 'Pendientes:', ...pending.map((p) => `• ${p}`)); }
      const next = asStringArray(result.next_steps);
      if (next.length) { lines.push('', 'Próximos pasos:', ...next.map((n) => `• ${n}`)); }
      break;
    }
    case 'study': {
      if (asString(result.summary)) lines.push(asString(result.summary), '');
      asRecordArray(result.key_concepts).forEach((c) => {
        lines.push(`• ${asString(c.concept) || asString(c.term)}: ${asString(c.explanation) || asString(c.definition)}`);
      });
      const review = asStringArray(result.review_points);
      if (review.length) { lines.push('', 'Puntos de repaso:', ...review.map((r) => `• ${r}`)); }
      break;
    }
    case 'ideas': {
      if (asString(result.core_idea)) lines.push(asString(result.core_idea), '');
      asRecordArray(result.opportunities).forEach((o) => {
        lines.push(`• ${asString(o.opportunity) || asString(o.text)}`);
      });
      const questions = asStringArray(result.open_questions);
      if (questions.length) { lines.push('', 'Preguntas abiertas:', ...questions.map((q) => `• ${q}`)); }
      if (asString(result.suggested_next_step)) lines.push('', `Siguiente paso: ${asString(result.suggested_next_step)}`);
      break;
    }
    default:
      lines.push(JSON.stringify(result, null, 2));
  }
  return lines.join('\n').trim();
}

/** Footer copy button for mode results. */
function CopyResultFooter({ mode, result }: { mode: OutputMode; result: Record<string, unknown> }) {
  return (
    <TouchableOpacity
      style={styles.copyResultFooter}
      activeOpacity={0.7}
      onPress={() => {
        hapticModeChange();
        copyText(buildModeTextForCopy(mode, result), 'Resultado copiado');
      }}
      accessibilityLabel="Copiar resultado"
    >
      <Ionicons name="copy-outline" size={16} color={COLORS.primary} />
      <Text style={styles.copyResultFooterText}>Copiar resultado</Text>
    </TouchableOpacity>
  );
}

/** Copy button for messages. */
function CopyButton({ text, label }: { text: string; label: string }) {
  return (
    <TouchableOpacity
      style={styles.copyButton}
      activeOpacity={0.7}
      onPress={() => {
        hapticModeChange();
        copyText(text, 'Mensaje copiado');
      }}
    >
      <Ionicons name="copy-outline" size={14} color={COLORS.primary} />
      <Text style={styles.copyButtonText}>{label}</Text>
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// Mode Renderers
// ---------------------------------------------------------------------------

function SummaryView({ result }: { result: Record<string, unknown> }) {
  const summary = asString(result.summary);
  const keyPoints = asStringArray(result.key_points);
  const topics = asStringArray(result.topics);
  const speakerHighlights = asStringArray(result.speaker_highlights);

  return (
    <View style={styles.modeContainer}>
      <Card>
        <Text style={styles.bodyText}>{summary || 'Sin resumen disponible.'}</Text>
      </Card>

      {keyPoints.length > 0 && (
        <>
          <SectionHeader title="Puntos clave" icon="list-outline" />
          <BulletList items={keyPoints} />
        </>
      )}

      {topics.length > 0 && (
        <>
          <SectionHeader title="Temas" icon="pricetags-outline" />
          <ChipRow items={topics} />
        </>
      )}

      {speakerHighlights.length > 0 && (
        <>
          <SectionHeader title="Destacados por participante" icon="people-outline" />
          <BulletList items={speakerHighlights} />
        </>
      )}

      <CopyResultFooter mode="summary" result={result} />
    </View>
  );
}

function TasksView({ result, noteId }: { result: Record<string, unknown>; noteId: string }) {
  const tasks = parseTaskItems(result.tasks);
  const [checkedSet, setCheckedSet] = useState<Set<number>>(new Set());
  const [deletedSet, setDeletedSet] = useState<Set<number>>(new Set());
  const [editedTexts, setEditedTexts] = useState<Record<number, string>>({});
  const [loaded, setLoaded] = useState(false);

  const [customOrder, setCustomOrder] = useState<number[] | null>(null);

  const storageKey = tasksStorageKey(noteId);
  const editsKey = `task_edits_${noteId}`;
  const deletedKey = `task_deleted_${noteId}`;
  const orderKey = `task_order_${noteId}`;

  // Load persisted state
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      AsyncStorage.getItem(storageKey),
      AsyncStorage.getItem(editsKey),
      AsyncStorage.getItem(deletedKey),
      AsyncStorage.getItem(orderKey),
    ]).then(([rawChecked, rawEdits, rawDeleted, rawOrder]) => {
      if (cancelled) return;
      if (rawChecked != null) {
        try { setCheckedSet(new Set(JSON.parse(rawChecked))); } catch {}
      }
      if (rawEdits != null) {
        try { setEditedTexts(JSON.parse(rawEdits)); } catch {}
      }
      if (rawDeleted != null) {
        try { setDeletedSet(new Set(JSON.parse(rawDeleted))); } catch {}
      }
      if (rawOrder != null) {
        try { setCustomOrder(JSON.parse(rawOrder)); } catch {}
      }
      setLoaded(true);
    }).catch(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [noteId, storageKey, editsKey, deletedKey]);

  // Persist on change
  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(storageKey, JSON.stringify(Array.from(checkedSet))).catch(() => {});
  }, [checkedSet, storageKey, loaded]);

  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(editsKey, JSON.stringify(editedTexts)).catch(() => {});
  }, [editedTexts, editsKey, loaded]);

  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(deletedKey, JSON.stringify(Array.from(deletedSet))).catch(() => {});
  }, [deletedSet, deletedKey, loaded]);

  useEffect(() => {
    if (!loaded || customOrder === null) return;
    AsyncStorage.setItem(orderKey, JSON.stringify(customOrder)).catch(() => {});
  }, [customOrder, orderKey, loaded]);

  // ── Debounced DB sync — persist task edits as source of truth ──
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!loaded) return;
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(() => {
      // Build updated tasks array reflecting all edits
      const updatedTasks = tasks
        .filter(t => !deletedSet.has(t.originalIndex))
        .map(t => ({
          text: editedTexts[t.originalIndex] ?? t.text,
          priority: t.priority,
          responsible: t.responsible,
          type: t.type,
          checked: checkedSet.has(t.originalIndex),
        }));
      // Update mode_results in DB (best-effort, no error shown)
      supabase
        .from('mode_results')
        .update({ result: { ...result, tasks: updatedTasks } })
        .eq('note_id', noteId)
        .eq('mode', 'tasks')
        .then(() => {});
    }, 2000); // 2s debounce
    return () => { if (syncTimerRef.current) clearTimeout(syncTimerRef.current); };
  }, [checkedSet, editedTexts, deletedSet, customOrder, loaded, tasks, noteId, result]);

  const toggleTask = useCallback((index: number) => {
    hapticModeChange();
    setCheckedSet((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }, []);

  const editTask = useCallback((index: number, text: string) => {
    setEditedTexts((prev) => ({ ...prev, [index]: text }));
  }, []);

  const deleteTask = useCallback((index: number) => {
    hapticModeChange();
    setDeletedSet((prev) => {
      const next = new Set(prev);
      next.add(index);
      return next;
    });
    showToast('Tarea eliminada', 'info');
  }, []);

  const moveTask = useCallback((priority: Priority, fromIdx: number, direction: 'up' | 'down') => {
    const visible = tasks.filter((t) => !deletedSet.has(t.originalIndex));
    const groupItems = visible.filter((t) => t.priority === priority);
    const toIdx = direction === 'up' ? fromIdx - 1 : fromIdx + 1;
    if (toIdx < 0 || toIdx >= groupItems.length) return;
    // Build a new order array based on the full visible task list
    const ordered = customOrder ?? visible.map((t) => t.originalIndex);
    const fromOrig = groupItems[fromIdx].originalIndex;
    const toOrig = groupItems[toIdx].originalIndex;
    const newOrder = [...ordered];
    const fi = newOrder.indexOf(fromOrig);
    const ti = newOrder.indexOf(toOrig);
    if (fi >= 0 && ti >= 0) { newOrder[fi] = toOrig; newOrder[ti] = fromOrig; }
    setCustomOrder(newOrder);
  }, [tasks, deletedSet, customOrder]);

  const baseVisible = tasks.filter((t) => !deletedSet.has(t.originalIndex));
  const visibleTasks = customOrder
    ? [...baseVisible].sort((a, b) => {
        const ai = customOrder.indexOf(a.originalIndex);
        const bi = customOrder.indexOf(b.originalIndex);
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
      })
    : baseVisible;
  const completedCount = visibleTasks.filter((t) => checkedSet.has(t.originalIndex)).length;
  const totalCount = visibleTasks.length;

  // Group tasks by priority
  const grouped = PRIORITY_ORDER.reduce<Record<Priority, TaskItem[]>>(
    (acc, p) => {
      acc[p] = visibleTasks.filter((t) => t.priority === p);
      return acc;
    },
    { high: [], medium: [], low: [] },
  );

  if (totalCount === 0) {
    return (
      <View style={styles.modeContainer}>
        <Text style={styles.emptyText}>No se detectaron tareas.</Text>
      </View>
    );
  }

  return (
    <View style={styles.modeContainer}>
      {/* Counter */}
      <View style={styles.taskCounter}>
        <Text style={styles.taskCounterText}>
          {completedCount} de {totalCount} completada{totalCount === 1 ? '' : 's'}
        </Text>
        <View style={styles.taskProgressTrack}>
          <View
            style={[
              styles.taskProgressFill,
              { width: totalCount > 0 ? `${(completedCount / totalCount) * 100}%` : '0%' },
            ]}
          />
        </View>
      </View>

      {/* Grouped by priority */}
      {PRIORITY_ORDER.map((priority) => {
        const group = grouped[priority];
        if (group.length === 0) return null;
        const meta = PRIORITY_META[priority];
        return (
          <View key={priority}>
            <View style={styles.priorityHeader}>
              <View style={[styles.priorityDot, { backgroundColor: meta.color }]} />
              <Text style={[styles.priorityLabel, { color: meta.color }]}>
                Prioridad {meta.label}
              </Text>
              <Text style={styles.priorityCount}>({group.length})</Text>
            </View>
            {group.map((task, idx) => (
              <TaskCheckbox
                key={task.originalIndex}
                task={task}
                checked={checkedSet.has(task.originalIndex)}
                onToggle={() => toggleTask(task.originalIndex)}
                editedText={editedTexts[task.originalIndex]}
                onEdit={(text) => editTask(task.originalIndex, text)}
                onDelete={() => deleteTask(task.originalIndex)}
                onMoveUp={idx > 0 ? () => moveTask(priority, idx, 'up') : undefined}
                onMoveDown={idx < group.length - 1 ? () => moveTask(priority, idx, 'down') : undefined}
              />
            ))}
          </View>
        );
      })}

      <CopyResultFooter mode="tasks" result={result} />
    </View>
  );
}

function ActionPlanView({ result }: { result: Record<string, unknown> }) {
  const objective = asString(result.objective);
  const steps = asRecordArray(result.steps);
  const obstacles = asStringArray(result.obstacles);
  const nextStep = asString(result.next_immediate_step);
  const criteria = asString(result.success_criteria);

  return (
    <View style={styles.modeContainer}>
      {/* Objective */}
      {objective ? (
        <Card highlighted>
          <SectionHeader title="Objetivo" icon="flag-outline" />
          <Text style={styles.bodyText}>{objective}</Text>
        </Card>
      ) : null}

      {/* Numbered steps */}
      {steps.length > 0 && (
        <>
          <SectionHeader title="Pasos" icon="footsteps-outline" />
          {steps.map((step, idx) => (
            <View key={idx} style={styles.stepCard}>
              <View style={styles.stepNumber}>
                <Text style={styles.stepNumberText}>{idx + 1}</Text>
              </View>
              <View style={styles.stepContent}>
                <Text style={styles.stepTitle}>
                  {asString(step.title) || asString(step.step) || `Paso ${idx + 1}`}
                </Text>
                {asString(step.description) ? (
                  <Text style={styles.stepDescription}>{asString(step.description)}</Text>
                ) : null}
              </View>
            </View>
          ))}
        </>
      )}

      {/* Obstacles */}
      {obstacles.length > 0 && (
        <>
          <SectionHeader title="Obstáculos" icon="warning-outline" />
          <BulletList items={obstacles} />
        </>
      )}

      {/* Next immediate step */}
      {nextStep ? (
        <Card highlighted>
          <SectionHeader title="Siguiente paso inmediato" icon="arrow-forward-outline" />
          <Text style={styles.bodyText}>{nextStep}</Text>
        </Card>
      ) : null}

      {/* Success criteria */}
      {criteria ? (
        <>
          <SectionHeader title="Criterios de éxito" icon="trophy-outline" />
          <Card>
            <Text style={styles.bodyText}>{criteria}</Text>
          </Card>
        </>
      ) : null}

      <CopyResultFooter mode="action_plan" result={result} />
    </View>
  );
}

function CleanTextView({ result }: { result: Record<string, unknown> }) {
  const cleanText = asString(result.clean_text);

  return (
    <View style={styles.modeContainer}>
      <Text style={styles.cleanTextBody}>
        {cleanText || 'Sin texto limpio disponible.'}
      </Text>
      {/* Spacer for floating button */}
      <View style={{ height: 72 }} />

      {cleanText ? (
        <TouchableOpacity
          style={styles.floatingCopy}
          activeOpacity={0.8}
          onPress={() => {
            hapticModeChange();
            copyText(cleanText, 'Texto copiado');
          }}
          accessibilityLabel="Copiar todo"
        >
          <Ionicons name="copy-outline" size={18} color="#FFF" />
          <Text style={styles.floatingCopyText}>Copiar todo</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function ExecutiveReportView({ result }: { result: Record<string, unknown> }) {
  const context = asString(result.context);
  const executiveSummary = asString(result.executive_summary);
  const decisions = asRecordArray(result.decisions);
  const keyPoints = asStringArray(result.key_points);
  const agreements = asStringArray(result.agreements);
  const pendingItems = asStringArray(result.pending_items);
  const nextSteps = asStringArray(result.next_steps);
  const participants = asStringArray(result.participants);

  return (
    <View style={styles.modeContainer}>
      {/* Context */}
      {context ? (
        <>
          <SectionHeader title="Contexto" icon="information-circle-outline" />
          <Card>
            <Text style={styles.bodyText}>{context}</Text>
          </Card>
        </>
      ) : null}

      {/* Executive Summary */}
      {executiveSummary ? (
        <>
          <SectionHeader title="Resumen ejecutivo" icon="document-text-outline" />
          <Card highlighted>
            <Text style={styles.bodyText}>{executiveSummary}</Text>
          </Card>
        </>
      ) : null}

      {/* Decisions table */}
      {decisions.length > 0 && (
        <>
          <SectionHeader title="Decisiones" icon="git-branch-outline" />
          <View style={styles.tableContainer}>
            <View style={styles.tableHeader}>
              <Text style={[styles.tableHeaderText, styles.tableColWide]}>Decisión</Text>
              <Text style={[styles.tableHeaderText, styles.tableColNarrow]}>Responsable</Text>
            </View>
            {decisions.map((d, idx) => (
              <View key={idx} style={styles.tableRow}>
                <Text style={[styles.tableCell, styles.tableColWide]}>
                  {asString(d.decision) || asString(d.text)}
                </Text>
                <Text style={[styles.tableCell, styles.tableColNarrow]}>
                  {asString(d.responsible) || asString(d.owner) || '-'}
                </Text>
              </View>
            ))}
          </View>
        </>
      )}

      {/* Key Points */}
      {keyPoints.length > 0 && (
        <>
          <SectionHeader title="Puntos clave" icon="list-outline" />
          <BulletList items={keyPoints} />
        </>
      )}

      {/* Agreements */}
      {agreements.length > 0 && (
        <>
          <SectionHeader title="Acuerdos" icon="people-outline" />
          <BulletList items={agreements} />
        </>
      )}

      {/* Pending Items */}
      {pendingItems.length > 0 && (
        <>
          <SectionHeader title="Pendientes" icon="time-outline" />
          <BulletList items={pendingItems} />
        </>
      )}

      {/* Next Steps */}
      {nextSteps.length > 0 && (
        <>
          <SectionHeader title="Próximos pasos" icon="arrow-forward-outline" />
          <BulletList items={nextSteps} />
        </>
      )}

      {/* Participants */}
      {participants.length > 0 && (
        <>
          <SectionHeader title="Participantes" icon="people-outline" />
          <ChipRow items={participants} />
        </>
      )}

      <CopyResultFooter mode="executive_report" result={result} />
    </View>
  );
}

function ReadyMessageView({ result }: { result: Record<string, unknown> }) {
  const messagesObj = (typeof result.messages === 'object' && result.messages !== null && !Array.isArray(result.messages))
    ? (result.messages as Record<string, unknown>)
    : {};
  const suggestedSubject = asString(result.suggested_subject);
  const contextNote = asString(result.context_note);

  const tones: { key: MessageTone; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { key: 'professional', label: 'Profesional', icon: 'briefcase-outline' },
    { key: 'friendly', label: 'Amigable', icon: 'happy-outline' },
    { key: 'firm', label: 'Firme', icon: 'shield-outline' },
    { key: 'brief', label: 'Breve', icon: 'flash-outline' },
  ];

  return (
    <View style={styles.modeContainer}>
      {suggestedSubject ? (
        <Card highlighted>
          <Text style={styles.labelSmall}>Asunto sugerido</Text>
          <Text style={styles.bodyTextBold}>{suggestedSubject}</Text>
        </Card>
      ) : null}

      {contextNote ? (
        <Card>
          <Text style={styles.labelSmall}>Contexto</Text>
          <Text style={styles.bodyText}>{contextNote}</Text>
        </Card>
      ) : null}

      {tones.map((tone) => {
        const text = asString(messagesObj[tone.key]);
        if (!text) return null;
        return (
          <View key={tone.key} style={styles.messageCard}>
            <View style={styles.messageCardHeader}>
              <Ionicons name={tone.icon} size={16} color={COLORS.primary} />
              <Text style={styles.messageCardTitle}>{tone.label}</Text>
            </View>
            <Text style={styles.messageCardBody}>{text}</Text>
            <CopyButton text={text} label="Copiar" />
          </View>
        );
      })}
    </View>
  );
}

function StudyView({ result }: { result: Record<string, unknown> }) {
  const summary = asString(result.summary);
  const keyConcepts = asRecordArray(result.key_concepts);
  const reviewPoints = asStringArray(result.review_points);
  const probableQuestions = asRecordArray(result.probable_questions);
  const mnemonics = asStringArray(result.mnemonics);

  return (
    <View style={styles.modeContainer}>
      {/* Summary card */}
      {summary ? (
        <>
          <SectionHeader title="Resumen" icon="document-text-outline" />
          <Card>
            <Text style={styles.bodyText}>{summary}</Text>
          </Card>
        </>
      ) : null}

      {/* Key concepts as flashcard-style rows */}
      {keyConcepts.length > 0 && (
        <>
          <SectionHeader title="Conceptos clave" icon="school-outline" />
          {keyConcepts.map((concept, idx) => (
            <View key={idx} style={styles.flashcard}>
              <Text style={styles.flashcardTerm}>
                {asString(concept.concept) || asString(concept.term) || `Concepto ${idx + 1}`}
              </Text>
              <Text style={styles.flashcardDef}>
                {asString(concept.definition) || asString(concept.explanation)}
              </Text>
            </View>
          ))}
        </>
      )}

      {/* Review points as checklist */}
      {reviewPoints.length > 0 && (
        <>
          <SectionHeader title="Puntos de repaso" icon="checkbox-outline" />
          <BulletList items={reviewPoints} />
        </>
      )}

      {/* Probable questions with expandable hints */}
      {probableQuestions.length > 0 && (
        <>
          <SectionHeader title="Preguntas probables" icon="help-circle-outline" />
          {probableQuestions.map((q, idx) => (
            <QuestionRow
              key={idx}
              question={asString(q.question) || `Pregunta ${idx + 1}`}
              hint={asString(q.hint) || asString(q.answer)}
            />
          ))}
        </>
      )}

      {/* Mnemonics */}
      {mnemonics.length > 0 && (
        <>
          <SectionHeader title="Mnemotecnias" icon="bulb-outline" />
          <BulletList items={mnemonics} />
        </>
      )}

      <CopyResultFooter mode="study" result={result} />
    </View>
  );
}

function IdeasView({ result }: { result: Record<string, unknown> }) {
  const coreIdea = asString(result.core_idea);
  const opportunities = asRecordArray(result.opportunities);
  const interestingPoints = asStringArray(result.interesting_points);
  const openQuestions = asStringArray(result.open_questions);
  const suggestedNextStep = asString(result.suggested_next_step);
  const structuredVersion = asString(result.structured_version);

  return (
    <View style={styles.modeContainer}>
      {/* Core idea highlighted */}
      {coreIdea ? (
        <Card highlighted>
          <SectionHeader title="Idea central" icon="bulb-outline" />
          <Text style={styles.bodyText}>{coreIdea}</Text>
        </Card>
      ) : null}

      {/* Opportunities with potential badges */}
      {opportunities.length > 0 && (
        <>
          <SectionHeader title="Oportunidades" icon="trending-up-outline" />
          {opportunities.map((opp, idx) => (
            <View key={idx} style={styles.opportunityRow}>
              <View style={styles.opportunityContent}>
                <Text style={styles.opportunityText}>
                  {asString(opp.text) || asString(opp.opportunity) || `Oportunidad ${idx + 1}`}
                </Text>
              </View>
              {asString(opp.potential) ? (
                <View style={styles.potentialBadge}>
                  <Text style={styles.potentialBadgeText}>{asString(opp.potential)}</Text>
                </View>
              ) : null}
            </View>
          ))}
        </>
      )}

      {/* Interesting points */}
      {interestingPoints.length > 0 && (
        <>
          <SectionHeader title="Puntos interesantes" icon="sparkles-outline" />
          <BulletList items={interestingPoints} />
        </>
      )}

      {/* Open questions */}
      {openQuestions.length > 0 && (
        <>
          <SectionHeader title="Preguntas abiertas" icon="help-circle-outline" />
          <BulletList items={openQuestions} />
        </>
      )}

      {/* Suggested next step */}
      {suggestedNextStep ? (
        <Card highlighted>
          <SectionHeader title="Siguiente paso sugerido" icon="arrow-forward-outline" />
          <Text style={styles.bodyText}>{suggestedNextStep}</Text>
        </Card>
      ) : null}

      {/* Structured version */}
      {structuredVersion ? (
        <>
          <SectionHeader title="Versión estructurada" icon="layers-outline" />
          <Card>
            <Text style={styles.bodyText}>{structuredVersion}</Text>
          </Card>
        </>
      ) : null}

      <CopyResultFooter mode="ideas" result={result} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function ModeResultView({ mode, result, noteId }: ModeResultViewProps) {
  switch (mode) {
    case 'summary':
      return <SummaryView result={result} />;
    case 'tasks':
      return <TasksView result={result} noteId={noteId} />;
    case 'action_plan':
      return <ActionPlanView result={result} />;
    case 'clean_text':
      return <CleanTextView result={result} />;
    case 'executive_report':
      return <ExecutiveReportView result={result} />;
    case 'ready_message':
      return <ReadyMessageView result={result} />;
    case 'study':
      return <StudyView result={result} />;
    case 'ideas':
      return <IdeasView result={result} />;
    default: {
      // Unknown mode — render raw JSON safely
      const _exhaustive: never = mode;
      return (
        <View style={styles.modeContainer}>
          <Card>
            <Text style={styles.bodyText}>
              {JSON.stringify(result, null, 2)}
            </Text>
          </Card>
        </View>
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  // -- Layout --
  modeContainer: {
    gap: 16,
  },

  // -- Copy result footer --
  copyResultFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    marginTop: 4,
    borderRadius: 12,
    backgroundColor: COLORS.surfaceAlt,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  copyResultFooterText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.primary,
  },

  // -- Section headers --
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },

  // -- Card --
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  cardHighlighted: {
    backgroundColor: COLORS.surfaceAlt,
    borderColor: COLORS.primaryLight,
  },

  // -- Text --
  bodyText: {
    fontSize: 15,
    lineHeight: 24,
    color: COLORS.textPrimary,
  },
  bodyTextBold: {
    fontSize: 15,
    lineHeight: 24,
    color: COLORS.textPrimary,
    fontWeight: '700',
  },
  labelSmall: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  emptyText: {
    fontSize: 14,
    color: COLORS.textMuted,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 24,
  },

  // -- Bullets --
  bulletList: {
    gap: 8,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  bullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.primary,
    marginTop: 8,
    marginRight: 10,
  },
  bulletText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 22,
    color: COLORS.textPrimary,
  },

  // -- Chips --
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  topicChip: {
    backgroundColor: COLORS.surfaceAlt,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  topicChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.primary,
  },

  // -- Tasks --
  taskCounter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: COLORS.surfaceAlt,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
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
  priorityHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  priorityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  priorityLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
  priorityCount: {
    fontSize: 12,
    color: COLORS.textMuted,
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
  taskContent: {
    flex: 1,
    gap: 6,
  },
  taskText: {
    fontSize: 14,
    lineHeight: 22,
    color: COLORS.textPrimary,
  },
  taskTextChecked: {
    textDecorationLine: 'line-through',
    color: COLORS.textMuted,
  },
  taskEditInput: {
    fontSize: 14,
    lineHeight: 22,
    color: COLORS.textPrimary,
    borderWidth: 1,
    borderColor: COLORS.primaryLight,
    borderRadius: 8,
    padding: 8,
    backgroundColor: COLORS.surfaceAlt,
  },
  taskActions: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: 2,
    marginLeft: 4,
  },
  reorderBtn: {
    padding: 2,
  },
  taskDeleteBtn: {
    padding: 4,
    marginTop: 2,
  },
  taskMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  responsibleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.surfaceAlt,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  responsibleText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.primary,
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  typeBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },

  // -- Action plan steps --
  stepCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 14,
    gap: 12,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumberText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  stepContent: {
    flex: 1,
    gap: 4,
  },
  stepTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textPrimary,
    lineHeight: 22,
  },
  stepDescription: {
    fontSize: 13,
    lineHeight: 20,
    color: COLORS.textSecondary,
  },

  // -- Clean text --
  cleanTextBody: {
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

  // -- Table (executive report decisions) --
  tableContainer: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    overflow: 'hidden',
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: COLORS.surfaceAlt,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  tableHeaderText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tableRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
    backgroundColor: COLORS.surface,
  },
  tableCell: {
    fontSize: 13,
    lineHeight: 20,
    color: COLORS.textPrimary,
  },
  tableColWide: {
    flex: 2,
    paddingRight: 8,
  },
  tableColNarrow: {
    flex: 1,
  },

  // -- Messages (ready_message) --
  messageCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  messageCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  messageCardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  messageCardBody: {
    fontSize: 14,
    lineHeight: 22,
    color: COLORS.textSecondary,
  },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-end',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: COLORS.surfaceAlt,
  },
  copyButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.primary,
  },

  // -- Study flashcards --
  flashcard: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 14,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.primary,
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  flashcardTerm: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.primary,
  },
  flashcardDef: {
    fontSize: 13,
    lineHeight: 20,
    color: COLORS.textSecondary,
  },

  // -- Study questions --
  questionCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  questionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  questionText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textPrimary,
    lineHeight: 22,
  },
  hintContainer: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  hintText: {
    fontSize: 13,
    lineHeight: 20,
    color: COLORS.textSecondary,
    fontStyle: 'italic',
  },

  // -- Ideas opportunities --
  opportunityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    gap: 10,
  },
  opportunityContent: {
    flex: 1,
  },
  opportunityText: {
    fontSize: 14,
    lineHeight: 22,
    color: COLORS.textPrimary,
  },
  potentialBadge: {
    backgroundColor: COLORS.success + '20',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  potentialBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.success,
  },
});
