import { File } from 'expo-file-system';
import { supabase } from '@/lib/supabase';
import type { NoteTemplate, OutputMode } from '@/types';

export async function uploadAudioAndProcess(
  noteId: string,
  audioUri: string,
  userId: string,
  template: NoteTemplate = 'quick_idea',
  primaryMode: OutputMode = 'summary'
): Promise<void> {
  const timestamp = Date.now();
  const audioPath = `${userId}/${timestamp}.m4a`;

  await supabase
    .from('notes')
    .update({ status: 'uploading' })
    .eq('id', noteId);

  const file = new File(audioUri);
  if (!file.exists) {
    throw new Error('El archivo de audio no existe.');
  }

  const arrayBuffer = await file.arrayBuffer();
  const byteArray = new Uint8Array(arrayBuffer);

  const { error: uploadError } = await supabase.storage
    .from('audio-files')
    .upload(audioPath, byteArray, {
      contentType: 'audio/m4a',
      upsert: false,
    });

  if (uploadError) {
    throw new Error('Error subiendo audio. Intenta de nuevo.');
  }

  // Store the path (not a public URL) — signed URLs are generated on demand
  await supabase
    .from('notes')
    .update({ audio_url: audioPath })
    .eq('id', noteId);

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    throw new Error('No hay sesión activa.');
  }

  const { error: fnError } = await supabase.functions.invoke('process-audio', {
    body: { note_id: noteId, audio_path: audioPath, template, primary_mode: primaryMode },
  });

  if (fnError) {
    throw new Error('Error procesando audio. Intenta de nuevo.');
  }
}

/**
 * Generate a signed URL for an audio file. Expires in 1 hour.
 */
export async function getSignedAudioUrl(audioPath: string): Promise<string | null> {
  if (!audioPath || audioPath.startsWith('http')) {
    // Already a full URL (legacy) — return as-is
    return audioPath || null;
  }
  const { data, error } = await supabase.storage
    .from('audio-files')
    .createSignedUrl(audioPath, 3600);

  if (error || !data?.signedUrl) {
    return null;
  }
  return data.signedUrl;
}

/**
 * Delete an audio file from storage.
 */
export async function deleteAudioFile(audioPath: string): Promise<void> {
  if (!audioPath || audioPath.startsWith('http')) return;
  await supabase.storage.from('audio-files').remove([audioPath]);
}
