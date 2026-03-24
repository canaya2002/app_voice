import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Animated,
} from 'react-native';
import { COLORS } from '@/lib/constants';
import {
  getSpeakerColor,
  getSpeakerDisplayName,
  formatTimestamp,
} from '@/lib/speaker-utils';
import type { TranscriptSegment, SpeakerInfo } from '@/types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface SpeakerTranscriptProps {
  segments: TranscriptSegment[];
  speakers: SpeakerInfo[];
  onRenameSpeaker?: () => void;
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

/** Determine bubble alignment: speaker index 0 = left, 1 = right, 2+ alternate. */
function getBubbleAlignment(
  speakers: SpeakerInfo[],
  speakerId: string,
): 'left' | 'right' {
  if (isNarratorMode(speakers)) return 'left';

  const speakerIndex = speakers.findIndex((s) => s.id === speakerId);
  if (speakerIndex <= 0) return 'left';
  if (speakerIndex === 1) return 'right';
  // 3+ speakers: alternate based on index
  return speakerIndex % 2 === 0 ? 'left' : 'right';
}

// ---------------------------------------------------------------------------
// Segment Bubble (animated)
// ---------------------------------------------------------------------------

interface SegmentBubbleProps {
  segment: TranscriptSegment;
  speakers: SpeakerInfo[];
  index: number;
  narratorMode: boolean;
  onRenameSpeaker?: () => void;
}

function SegmentBubble({
  segment,
  speakers,
  index,
  narratorMode,
  onRenameSpeaker,
}: SegmentBubbleProps) {
  const fadeAnim = useRef(new Animated.Value(0)).current;

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
        </View>

        {/* Speech bubble */}
        <View
          style={[
            styles.bubble,
            { backgroundColor: color.bg },
            isRight ? styles.bubbleRight : styles.bubbleLeft,
          ]}
        >
          <Text style={[styles.bubbleText, { color: color.text }]}>
            {segment.text}
          </Text>
        </View>
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
  onRenameSpeaker,
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
          onRenameSpeaker={onRenameSpeaker}
        />
      ))}
    </ScrollView>
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
  bubbleText: {
    fontSize: 14,
    lineHeight: 20,
  },
});
