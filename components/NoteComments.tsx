import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@/lib/constants';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { hapticButtonPress } from '@/lib/haptics';
import { showToast } from '@/components/Toast';
import type { Comment } from '@/types';

interface NoteCommentsProps {
  noteId: string;
}

export default function NoteComments({ noteId }: NoteCommentsProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);
  const { user } = useAuthStore();

  const fetchComments = useCallback(async () => {
    const { data } = await supabase
      .from('comments')
      .select('*')
      .eq('note_id', noteId)
      .order('created_at', { ascending: true });

    setComments((data ?? []) as Comment[]);
    setLoading(false);
  }, [noteId]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  const handlePost = useCallback(async () => {
    const text = draft.trim();
    if (!text || !user || posting) return;
    setPosting(true);
    hapticButtonPress();

    const { data, error } = await supabase
      .from('comments')
      .insert({ note_id: noteId, user_id: user.id, text })
      .select()
      .single();

    if (error) {
      showToast('Error al publicar comentario', 'error');
    } else if (data) {
      setComments((prev) => [...prev, data as Comment]);
      setDraft('');
    }
    setPosting(false);
  }, [draft, noteId, user, posting]);

  const handleDelete = useCallback((commentId: string) => {
    Alert.alert('Eliminar comentario', '¿Estás seguro?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          await supabase.from('comments').delete().eq('id', commentId);
          setComments((prev) => prev.filter((c) => c.id !== commentId));
          showToast('Comentario eliminado', 'info');
        },
      },
    ]);
  }, []);

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'ahora';
    if (diffMin < 60) return `hace ${diffMin}m`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `hace ${diffH}h`;
    return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
  };

  return (
    <View style={styles.container}>
      {loading ? (
        <ActivityIndicator size="small" color={COLORS.primaryLight} style={{ padding: 16 }} />
      ) : comments.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="chatbubble-outline" size={24} color={COLORS.borderLight} />
          <Text style={styles.emptyText}>Sin comentarios aún</Text>
        </View>
      ) : (
        <View style={styles.list}>
          {comments.map((comment) => (
            <View key={comment.id} style={styles.commentCard}>
              <View style={styles.commentHeader}>
                <View style={styles.commentAvatar}>
                  <Ionicons name="person" size={10} color={COLORS.textMuted} />
                </View>
                <Text style={styles.commentTime}>{formatTime(comment.created_at)}</Text>
                {comment.user_id === user?.id && (
                  <TouchableOpacity
                    onPress={() => handleDelete(comment.id)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    style={styles.deleteBtn}
                  >
                    <Ionicons name="trash-outline" size={12} color={COLORS.textMuted} />
                  </TouchableOpacity>
                )}
              </View>
              <Text style={styles.commentText}>{comment.text}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Input */}
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={setDraft}
          placeholder="Escribe un comentario..."
          placeholderTextColor={COLORS.textMuted}
          multiline
          maxLength={500}
        />
        <TouchableOpacity
          onPress={handlePost}
          disabled={!draft.trim() || posting}
          style={[styles.sendBtn, (!draft.trim() || posting) && { opacity: 0.3 }]}
        >
          {posting ? (
            <ActivityIndicator size="small" color="#FFF" />
          ) : (
            <Ionicons name="send" size={16} color="#FFF" />
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 24,
    marginBottom: 16,
    backgroundColor: COLORS.surfaceAlt,
    borderRadius: 16,
    overflow: 'hidden',
  },
  empty: {
    alignItems: 'center',
    gap: 6,
    paddingVertical: 20,
  },
  emptyText: {
    fontSize: 13,
    color: COLORS.textMuted,
  },
  list: {
    gap: 1,
    paddingTop: 8,
    paddingHorizontal: 14,
  },
  commentCard: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  commentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  commentAvatar: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: COLORS.borderLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  commentTime: {
    fontSize: 11,
    color: COLORS.textMuted,
    flex: 1,
  },
  deleteBtn: {
    padding: 2,
  },
  commentText: {
    fontSize: 14,
    lineHeight: 20,
    color: COLORS.textPrimary,
    paddingLeft: 24,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  input: {
    flex: 1,
    fontSize: 14,
    color: COLORS.textPrimary,
    maxHeight: 80,
    paddingVertical: 0,
  },
  sendBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
