import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@/lib/constants';
import {
  getSpeakerColor,
  getSpeakerDisplayName,
  formatTimestamp,
} from '@/lib/speaker-utils';
import { hapticSelection, hapticButtonPress } from '@/lib/haptics';
import { showToast } from '@/components/Toast';
import type { TranscriptSegment, SpeakerInfo } from '@/types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface SpeakerTranscriptProps {
  segments: TranscriptSegment[];
  speakers: SpeakerInfo[];
  highlights?: number[];
  activeSegmentIndex?: number;
  searchQuery?: string;
  onRenameSpeaker?: () => void;
  onEditSegment?: (index: number, newText: string) => void;
  onToggleHighlight?: (index: number) => void;
  onSegmentPress?: (segment: TranscriptSegment) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findSpeaker(speakers: SpeakerInfo[], speakerId: string): SpeakerInfo {
  return (
    speakers.find((s) => s.id === speakerId) ?? {
      id: speakerId,
      default_name: speakerId,
      color: 'purple',
    }
  );
}

function isNarratorMode(speakers: SpeakerInfo[]): boolean {
  return speakers.length === 1 && speakers[0].default_name === 'Narrador';
}

function getBubbleAlignment(
  speakers: SpeakerInfo[],
  speakerId: string,
): 'left' | 'right' {
  if (isNarratorMode(speakers)) return 'left';
  const speakerIndex = speakers.findIndex((s) => s.id === speakerId);
  if (speakerIndex <= 0) return 'left';
  if (speakerIndex === 1) return 'right';
  return speakerIndex % 2 === 0 ? 'left' : 'right';
}

// ---------------------------------------------------------------------------
// Segment Bubble
// ---------------------------------------------------------------------------

interface SegmentBubbleProps {
  segment: TranscriptSegment;
  speakers: SpeakerInfo[];
  index: number;
  narratorMode: boolean;
  highlighted: boolean;
  isActive: boolean;
  searchQuery?: string;
  onRenameSpeaker?: () => void;
  onEditSegment?: (index: number, newText: string) => void;
  onToggleHighlight?: (index: number) => void;
  onSegmentPress?: (segment: TranscriptSegment) => void;
}

function HighlightedText({ text, query, color: textColor }: { text: string; query?: string; color: string }) {
  if (!query || !query.trim()) {
    return <Text style={[styles.bubbleText, { color: textColor }]}>{text}</Text>;
  }
  const parts: { text: string; match: boolean }[] = [];
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  let lastIndex = 0;
  let pos = lower.indexOf(q, lastIndex);
  while (pos !== -1) {
    if (pos > lastIndex) parts.push({ text: text.slice(lastIndex, pos), match: false });
    parts.push({ text: text.slice(pos, pos + q.length), match: true });
    lastIndex = pos + q.length;
    pos = lower.indexOf(q, lastIndex);
  }
  if (lastIndex < text.length) parts.push({ text: text.slice(lastIndex), match: false });
  return (
    <Text style={[styles.bubbleText, { color: textColor }]}>
      {parts.map((p, i) =>
        p.match ? (
          <Text key={i} style={{ backgroundColor: COLORS.accentGold + '40', borderRadius: 2 }}>{p.text}</Text>
        ) : (
          <Text key={i}>{p.text}</Text>
        ),
      )}
    </Text>
  );
}

function SegmentBubble({
  segment,
  speakers,
  index,
  narratorMode,
  highlighted,
  isActive,
  searchQuery,
  onRenameSpeaker,
  onEditSegment,
  onToggleHighlight,
  onSegmentPress,
}: SegmentBubbleProps) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(segment.text);

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 300,
      delay: index * 50,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim, index]);

  const speaker = findSpeaker(speakers, segment.speaker);
  const color = getSpeakerColor(speaker.color);
  const displayName = getSpeakerDisplayName(speaker);
  const alignment = getBubbleAlignment(speakers, segment.speaker);
  const isRight = alignment === 'right' && !narratorMode;

  const handleLongPress = useCallback(() => {
    if (onToggleHighlight) {
      hapticSelection();
      onToggleHighlight(index);
    }
  }, [onToggleHighlight, index]);

  const handleDoubleTap = useCallback(() => {
    if (onEditSegment) {
      setDraft(segment.text);
      setEditing(true);
    }
  }, [onEditSegment, segment.text]);

  const handleSaveEdit = useCallback(() => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== segment.text && onEditSegment) {
      onEditSegment(index, trimmed);
    }
    setEditing(false);
  }, [draft, segment.text, onEditSegment, index]);

  return (
    <Animated.View
      style={[
        styles.segmentRow,
        isRight ? styles.segmentRowRight : styles.segmentRowLeft,
        { opacity: fadeAnim },
      ]}
    >
      <View
        style={[
          styles.bubbleWrapper,
          isRight ? styles.bubbleWrapperRight : styles.bubbleWrapperLeft,
        ]}
      >
        {/* Speaker name (tappable) */}
        <View
          style={[
            styles.labelRow,
            isRight ? styles.labelRowRight : styles.labelRowLeft,
          ]}
        >
          <TouchableOpacity
            onPress={onRenameSpeaker}
            activeOpacity={onRenameSpeaker ? 0.6 : 1}
            disabled={!onRenameSpeaker}
            accessibilityLabel={`Renombrar ${displayName}`}
          >
            <Text style={[styles.speakerName, { color: color.text }]}>
              {displayName}
            </Text>
          </TouchableOpacity>
          <Text style={styles.timestamp}>
            {formatTimestamp(segment.start)}
          </Text>
          {highlighted && (
            <Ionicons name="bookmark" size={10} color={COLORS.accentGold} />
          )}
        </View>

        {/* Speech bubble */}
        <TouchableOpacity
          activeOpacity={0.8}
          onLongPress={() => {
            if (onToggleHighlight) {
              hapticSelection();
              onToggleHighlight(index);
            } else if (onEditSegment) {
              setDraft(segment.text);
              setEditing(true);
            }
          }}
          onPress={() => {
            if (onSegmentPress) {
              hapticSelection();
              onSegmentPress(segment);
            } else {
              handleDoubleTap();
            }
          }}
          delayLongPress={400}
          style={[
            styles.bubble,
            { backgroundColor: highlighted ? COLORS.accentGold + '20' : color.bg },
            isRight ? styles.bubbleRight : styles.bubbleLeft,
            highlighted && styles.bubbleHighlighted,
            isActive && styles.bubbleActive,
          ]}
        >
          {editing ? (
            <View>
              <TextInput
                style={[styles.bubbleText, styles.bubbleInput, { color: color.text }]}
                value={draft}
                onChangeText={setDraft}
                multiline
                autoFocus
                onBlur={handleSaveEdit}
              />
              <View style={styles.editActions}>
                <TouchableOpacity onPress={() => setEditing(false)} style={styles.editCancelBtn}>
                  <Text style={styles.editCancelText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleSaveEdit} style={styles.editSaveBtn}>
                  <Ionicons name="checkmark" size={14} color="#FFF" />
                  <Text style={styles.editSaveText}>Guardar</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <HighlightedText text={segment.text} query={searchQuery} color={color.text} />
          )}
          {isActive && (
            <View style={styles.activeIndicator}>
              <Ionicons name="volume-high" size={10} color={COLORS.primaryLight} />
            </View>
          )}
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function SpeakerTranscript({
  segments,
  speakers,
  highlights = [],
  activeSegmentIndex,
  searchQuery,
  onRenameSpeaker,
  onEditSegment,
  onToggleHighlight,
  onSegmentPress,
}: SpeakerTranscriptProps) {
  const narratorMode = isNarratorMode(speakers);

  if (segments.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>Sin segmentos de transcripción</Text>
      </View>
    );
  }

  return (
    <View>
      {/* Hint text */}
      {(onSegmentPress || onEditSegment || onToggleHighlight) && (
        <View style={styles.hintBar}>
          {onSegmentPress && (
            <View style={styles.hintItem}>
              <Ionicons name="play-outline" size={12} color={COLORS.primaryLight} />
              <Text style={styles.hintText}>Toca para reproducir</Text>
            </View>
          )}
          {onToggleHighlight && (
            <View style={styles.hintItem}>
              <Ionicons name="bookmark-outline" size={12} color={COLORS.accentGold} />
              <Text style={styles.hintText}>Mantén pulsado para resaltar</Text>
            </View>
          )}
        </View>
      )}

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {segments.map((segment, index) => (
          <SegmentBubble
            key={`${segment.speaker}-${segment.start}-${index}`}
            segment={segment}
            speakers={speakers}
            index={index}
            narratorMode={narratorMode}
            highlighted={highlights.includes(index)}
            isActive={activeSegmentIndex === index}
            searchQuery={searchQuery}
            onRenameSpeaker={onRenameSpeaker}
            onEditSegment={onEditSegment}
            onToggleHighlight={onToggleHighlight}
            onSegmentPress={onSegmentPress}
          />
        ))}
      </ScrollView>
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
  contentContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },

  // -- Hint bar ---------------------------------------------------------------
  hintBar: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    paddingVertical: 6,
    paddingHorizontal: 16,
  },
  hintItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  hintText: {
    fontSize: 11,
    color: COLORS.textMuted,
  },

  // -- Empty state -----------------------------------------------------------
  emptyContainer: {
    padding: 24,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: COLORS.textMuted,
  },

  // -- Segment row -----------------------------------------------------------
  segmentRow: {
    flexDirection: 'row',
    maxWidth: '85%',
  },
  segmentRowLeft: {
    alignSelf: 'flex-start',
  },
  segmentRowRight: {
    alignSelf: 'flex-end',
  },

  // -- Bubble wrapper --------------------------------------------------------
  bubbleWrapper: {
    flex: 1,
  },
  bubbleWrapperLeft: {
    alignItems: 'flex-start',
  },
  bubbleWrapperRight: {
    alignItems: 'flex-end',
  },

  // -- Label row (speaker name + timestamp) ----------------------------------
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  labelRowLeft: {
    justifyContent: 'flex-start',
  },
  labelRowRight: {
    flexDirection: 'row-reverse',
  },
  speakerName: {
    fontSize: 12,
    fontWeight: '700',
  },
  timestamp: {
    fontSize: 10,
    color: COLORS.textMuted,
  },

  // -- Bubble ----------------------------------------------------------------
  bubble: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxWidth: '100%',
  },
  bubbleLeft: {
    borderRadius: 16,
    borderTopLeftRadius: 4,
  },
  bubbleRight: {
    borderRadius: 16,
    borderTopRightRadius: 4,
  },
  bubbleHighlighted: {
    borderWidth: 1,
    borderColor: COLORS.accentGold + '50',
  },
  bubbleActive: {
    borderWidth: 1.5,
    borderColor: COLORS.primaryLight,
    shadowColor: COLORS.primaryLight,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  activeIndicator: {
    position: 'absolute',
    top: 4,
    right: 6,
  },
  bubbleText: {
    fontSize: 14,
    lineHeight: 20,
  },
  bubbleInput: {
    minHeight: 40,
    textAlignVertical: 'top',
    padding: 0,
  },

  // -- Edit actions ----------------------------------------------------------
  editActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 8,
  },
  editCancelBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  editCancelText: {
    fontSize: 12,
    color: COLORS.textMuted,
    fontWeight: '500',
  },
  editSaveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: COLORS.primary,
  },
  editSaveText: {
    fontSize: 12,
    color: '#FFFFFF',
    fontWeight: '600',
  },
});
