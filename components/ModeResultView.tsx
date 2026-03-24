import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS } from '@/lib/constants';
import { selectionTap, successTap } from '@/lib/haptics';
import { showToast } from '@/components/Toast';
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
  successTap();
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
}: {
  task: TaskItem;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <TouchableOpacity
      style={styles.taskRow}
      activeOpacity={0.7}
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
    >
      <View style={styles.checkboxOuter}>
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
      </View>

      <View style={styles.taskContent}>
        <Text style={[styles.taskText, checked && styles.taskTextChecked]}>
          {task.text}
        </Text>
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
    </TouchableOpacity>
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
        selectionTap();
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

/** Copy button for messages. */
function CopyButton({ text, label }: { text: string; label: string }) {
  return (
    <TouchableOpacity
      style={styles.copyButton}
      activeOpacity={0.7}
      onPress={() => {
        selectionTap();
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
    </View>
  );
}

function TasksView({ result, noteId }: { result: Record<string, unknown>; noteId: string }) {
  const tasks = parseTaskItems(result.tasks);
  const [checkedSet, setCheckedSet] = useState<Set<number>>(new Set());
  const [loaded, setLoaded] = useState(false);

  // Load persisted state
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(tasksStorageKey(noteId))
      .then((raw) => {
        if (cancelled) return;
        if (raw != null) {
          try {
            const arr: number[] = JSON.parse(raw);
            setCheckedSet(new Set(arr));
          } catch {
            // corrupted — ignore
          }
        }
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [noteId]);

  // Persist on change
  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(
      tasksStorageKey(noteId),
      JSON.stringify(Array.from(checkedSet)),
    ).catch(() => {});
  }, [checkedSet, noteId, loaded]);

  const toggleTask = useCallback((index: number) => {
    selectionTap();
    setCheckedSet((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }, []);

  const completedCount = checkedSet.size;
  const totalCount = tasks.length;

  // Group tasks by priority
  const grouped = PRIORITY_ORDER.reduce<Record<Priority, TaskItem[]>>(
    (acc, p) => {
      acc[p] = tasks.filter((t) => t.priority === p);
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
            {group.map((task) => (
              <TaskCheckbox
                key={task.originalIndex}
                task={task}
                checked={checkedSet.has(task.originalIndex)}
                onToggle={() => toggleTask(task.originalIndex)}
              />
            ))}
          </View>
        );
      })}
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
            selectionTap();
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
