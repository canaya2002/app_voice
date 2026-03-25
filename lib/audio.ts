import { Audio, InterruptionModeIOS, InterruptionModeAndroid } from 'expo-av';
import { Platform, Alert, Linking } from 'react-native';

let currentRecording: Audio.Recording | null = null;

export async function requestAudioPermissions(): Promise<boolean> {
  const { status: existing } = await Audio.getPermissionsAsync();

  if (existing === 'granted') return true;

  if (existing === 'denied') {
    Alert.alert(
      'Micrófono necesario',
      'Sythio necesita acceso al micrófono para grabar. Actívalo en Configuración.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Abrir Configuración', onPress: () => Linking.openSettings() },
      ]
    );
    return false;
  }

  const { status } = await Audio.requestPermissionsAsync();
  return status === 'granted';
}

export async function setupAudioMode(): Promise<void> {
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: true,
    playsInSilentModeIOS: true,
    staysActiveInBackground: false,
    interruptionModeIOS: InterruptionModeIOS.DoNotMix,
    shouldDuckAndroid: true,
    interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
  });
}

export async function startRecording(
  onMeteringUpdate: (level: number) => void,
  onDurationUpdate: (seconds: number) => void
): Promise<Audio.Recording> {
  await setupAudioMode();

  const recording = new Audio.Recording();
  await recording.prepareToRecordAsync({
    ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
    isMeteringEnabled: true,
    android: {
      ...Audio.RecordingOptionsPresets.HIGH_QUALITY.android,
      extension: '.m4a',
      outputFormat: Audio.AndroidOutputFormat.MPEG_4,
      audioEncoder: Audio.AndroidAudioEncoder.AAC,
    },
    ios: {
      ...Audio.RecordingOptionsPresets.HIGH_QUALITY.ios,
      extension: '.m4a',
      outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
    },
    web: {
      mimeType: 'audio/webm',
      bitsPerSecond: 128000,
    },
  });

  recording.setOnRecordingStatusUpdate((status) => {
    if (status.isRecording) {
      const seconds = Math.floor((status.durationMillis ?? 0) / 1000);
      onDurationUpdate(seconds);
      const metering = status.metering ?? -160;
      const normalized = Math.max(0, Math.min(1, (metering + 60) / 60));
      onMeteringUpdate(normalized);
    }
  });

  recording.setProgressUpdateInterval(100);
  await recording.startAsync();
  currentRecording = recording;
  return recording;
}

export async function pauseRecording(): Promise<void> {
  if (currentRecording) {
    await currentRecording.pauseAsync();
  }
}

export async function resumeRecording(): Promise<void> {
  if (currentRecording) {
    await currentRecording.startAsync();
  }
}

export async function stopRecording(): Promise<string | null> {
  if (!currentRecording) return null;

  await currentRecording.stopAndUnloadAsync();
  const uri = currentRecording.getURI();

  await Audio.setAudioModeAsync({
    allowsRecordingIOS: false,
  });

  currentRecording = null;
  return uri;
}

export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export function formatDurationLong(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  if (mins === 0) return `${secs}s`;
  return `${mins}m ${secs}s`;
}

export async function createAudioPlayer(uri: string): Promise<Audio.Sound> {
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: false,
    playsInSilentModeIOS: true,
  });

  const { sound } = await Audio.Sound.createAsync(
    Platform.OS === 'web' ? { uri } : { uri },
    { shouldPlay: false }
  );

  return sound;
}
