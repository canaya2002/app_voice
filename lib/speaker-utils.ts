import type { SpeakerInfo, TranscriptSegment } from '@/types';
import { SPEAKER_COLORS } from '@/lib/constants';

export function buildSpeakerInfoList(speakersDetected: number): SpeakerInfo[] {
  const speakers: SpeakerInfo[] = [];
  for (let i = 0; i < speakersDetected; i++) {
    const colorIndex = i % SPEAKER_COLORS.length;
    speakers.push({
      id: `speaker_${i + 1}`,
      default_name: speakersDetected === 1 ? 'Narrador' : `Hablante ${i + 1}`,
      color: SPEAKER_COLORS[colorIndex].name,
    });
  }
  return speakers;
}

export function getSpeakerColor(colorName: string): { bg: string; text: string } {
  return SPEAKER_COLORS.find((c) => c.name === colorName) ?? SPEAKER_COLORS[0];
}

export function getSpeakerDisplayName(speaker: SpeakerInfo): string {
  return speaker.custom_name ?? speaker.default_name;
}

export function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function parseSpeakerDetectionResult(raw: string): {
  speakers_detected: number;
  is_conversation: boolean;
  segments: TranscriptSegment[];
  full_transcript: string;
} {
  try {
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned);
    return {
      speakers_detected: typeof parsed.speakers_detected === 'number' ? parsed.speakers_detected : 1,
      is_conversation: !!parsed.is_conversation,
      segments: Array.isArray(parsed.segments) ? parsed.segments : [],
      full_transcript: typeof parsed.full_transcript === 'string' ? parsed.full_transcript : '',
    };
  } catch {
    return { speakers_detected: 1, is_conversation: false, segments: [], full_transcript: '' };
  }
}
