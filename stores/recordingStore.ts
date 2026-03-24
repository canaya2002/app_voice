import { create } from 'zustand';
import type { RecordingState, NoteTemplate, OutputMode } from '@/types';

interface RecordingStore extends RecordingState {
  setRecording: (isRecording: boolean) => void;
  setPaused: (isPaused: boolean) => void;
  setDuration: (duration: number) => void;
  setUri: (uri: string | null) => void;
  addMetering: (level: number) => void;
  setSelectedTemplate: (template: NoteTemplate) => void;
  setSelectedMode: (mode: OutputMode) => void;
  reset: () => void;
}

const initialState: RecordingState = {
  isRecording: false,
  isPaused: false,
  duration: 0,
  uri: null,
  metering: [],
  selectedTemplate: 'quick_idea',
  selectedMode: 'summary',
};

export const useRecordingStore = create<RecordingStore>((set) => ({
  ...initialState,

  setRecording: (isRecording: boolean) => set({ isRecording }),
  setPaused: (isPaused: boolean) => set({ isPaused }),
  setDuration: (duration: number) => set({ duration }),
  setUri: (uri: string | null) => set({ uri }),
  addMetering: (level: number) =>
    set((state) => ({
      metering: [...state.metering.slice(-49), level],
    })),
  setSelectedTemplate: (selectedTemplate: NoteTemplate) => set({ selectedTemplate }),
  setSelectedMode: (selectedMode: OutputMode) => set({ selectedMode }),
  reset: () => set(initialState),
}));
