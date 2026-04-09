import { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Modal,
  FlatList,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown, FadeIn, FadeOut } from 'react-native-reanimated';
import { COLORS } from '@/lib/constants';
import { supabase } from '@/lib/supabase';
import AnimatedPressable from './AnimatedPressable';
import { hapticButtonPress, hapticSelection } from '@/lib/haptics';
import { router } from 'expo-router';
import { useNotesStore } from '@/stores/notesStore';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import type { ChatContextSelection, ChatContextType, Note, Folder, Channel } from '@/types';

// ── Types ──────────────────────────────────────────────────────────────────

interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  sources?: string[];
}

interface AIChatModalProps {
  visible: boolean;
  onClose: () => void;
}

// ── Context Picker ─────────────────────────────────────────────────────────

function ContextPicker({
  context,
  onChange,
  notes,
  folders,
  channels,
}: {
  context: ChatContextSelection;
  onChange: (ctx: ChatContextSelection) => void;
  notes: Note[];
  folders: Folder[];
  channels: Channel[];
}) {
  const [showPicker, setShowPicker] = useState(false);
  const [pickerMode, setPickerMode] = useState<ChatContextType>('all');
  const [selectedNoteIds, setSelectedNoteIds] = useState<Set<string>>(new Set());
  const [selectedFolderIds, setSelectedFolderIds] = useState<Set<string>>(new Set());
  const [selectedChannelIds, setSelectedChannelIds] = useState<Set<string>>(new Set());

  const typeOptions: { value: ChatContextType; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { value: 'all', label: 'Todas mis notas', icon: 'globe-outline' },
    { value: 'notes', label: 'Notas específicas', icon: 'document-text-outline' },
    { value: 'folder', label: 'Carpetas', icon: 'folder-outline' },
    { value: 'channel', label: 'Canales', icon: 'chatbubbles-outline' },
  ];

  const handleConfirm = () => {
    if (pickerMode === 'all') {
      onChange({ type: 'all', label: 'Todas mis notas' });
    } else if (pickerMode === 'notes') {
      const ids = Array.from(selectedNoteIds);
      const names = notes.filter(n => ids.includes(n.id)).map(n => n.title).slice(0, 3);
      const label = ids.length === 0 ? 'Todas mis notas' : `${names.join(', ')}${ids.length > 3 ? ` +${ids.length - 3}` : ''}`;
      onChange({ type: ids.length > 0 ? 'notes' : 'all', note_ids: ids, label });
    } else if (pickerMode === 'folder') {
      const ids = Array.from(selectedFolderIds);
      const names = folders.filter(f => ids.includes(f.id)).map(f => f.name).slice(0, 3);
      const label = ids.length === 0 ? 'Todas mis notas' : `Carpetas: ${names.join(', ')}`;
      onChange({ type: ids.length > 0 ? 'folder' : 'all', folder_ids: ids, label });
    } else if (pickerMode === 'channel') {
      const ids = Array.from(selectedChannelIds);
      const names = channels.filter(c => ids.includes(c.id)).map(c => c.name).slice(0, 3);
      const label = ids.length === 0 ? 'Todas mis notas' : `Canales: ${names.join(', ')}`;
      onChange({ type: ids.length > 0 ? 'channel' : 'all', channel_ids: ids, label });
    }
    setShowPicker(false);
  };

  const toggleId = (set: Set<string>, id: string): Set<string> => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  };

  return (
    <>
      {/* Context indicator bar */}
      <TouchableOpacity
        style={styles.contextBar}
        onPress={() => { hapticSelection(); setShowPicker(true); }}
      >
        <Ionicons name="funnel-outline" size={14} color={COLORS.primaryLight} />
        <Text style={styles.contextLabel} numberOfLines={1}>
          {context.label}
        </Text>
        <Ionicons name="chevron-down" size={14} color={COLORS.textMuted} />
      </TouchableOpacity>

      {/* Picker sheet */}
      {showPicker && (
        <Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(100)} style={styles.pickerOverlay}>
          <View style={styles.pickerSheet}>
            <View style={styles.pickerHeader}>
              <Text style={styles.pickerTitle}>Seleccionar contexto</Text>
              <TouchableOpacity onPress={() => setShowPicker(false)}>
                <Ionicons name="close" size={22} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Type tabs */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pickerTabs}>
              {typeOptions.map((opt) => (
                <TouchableOpacity
                  key={opt.value}
                  onPress={() => { hapticSelection(); setPickerMode(opt.value); }}
                  style={[styles.pickerTab, pickerMode === opt.value && styles.pickerTabActive]}
                >
                  <Ionicons
                    name={opt.icon}
                    size={15}
                    color={pickerMode === opt.value ? COLORS.primaryLight : COLORS.textMuted}
                  />
                  <Text style={[styles.pickerTabText, pickerMode === opt.value && styles.pickerTabTextActive]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Selection content */}
            <ScrollView style={styles.pickerContent}>
              {pickerMode === 'all' && (
                <View style={styles.pickerInfo}>
                  <Ionicons name="globe-outline" size={28} color={COLORS.primaryLight} />
                  <Text style={styles.pickerInfoText}>Se buscará en todas tus notas procesadas.</Text>
                </View>
              )}

              {pickerMode === 'notes' && (
                <>
                  {notes.filter(n => n.status === 'done').slice(0, 30).map((note) => {
                    const sel = selectedNoteIds.has(note.id);
                    return (
                      <TouchableOpacity
                        key={note.id}
                        style={[styles.pickerItem, sel && styles.pickerItemSel]}
                        onPress={() => setSelectedNoteIds(toggleId(selectedNoteIds, note.id))}
                      >
                        <View style={[styles.pickerCheck, sel && styles.pickerCheckSel]}>
                          {sel && <Ionicons name="checkmark" size={12} color="#FFF" />}
                        </View>
                        <View style={styles.pickerItemContent}>
                          <Text style={styles.pickerItemTitle} numberOfLines={1}>{note.title}</Text>
                          <Text style={styles.pickerItemSub} numberOfLines={1}>
                            {note.summary?.slice(0, 80) || 'Sin resumen'}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                  {notes.filter(n => n.status === 'done').length === 0 && (
                    <Text style={styles.pickerEmpty}>No hay notas procesadas.</Text>
                  )}
                </>
              )}

              {pickerMode === 'folder' && (
                <>
                  {folders.map((folder) => {
                    const sel = selectedFolderIds.has(folder.id);
                    return (
                      <TouchableOpacity
                        key={folder.id}
                        style={[styles.pickerItem, sel && styles.pickerItemSel]}
                        onPress={() => setSelectedFolderIds(toggleId(selectedFolderIds, folder.id))}
                      >
                        <View style={[styles.pickerCheck, sel && styles.pickerCheckSel]}>
                          {sel && <Ionicons name="checkmark" size={12} color="#FFF" />}
                        </View>
                        <View style={[styles.folderDot, { backgroundColor: folder.color }]} />
                        <Text style={styles.pickerItemTitle}>{folder.name}</Text>
                      </TouchableOpacity>
                    );
                  })}
                  {folders.length === 0 && (
                    <Text style={styles.pickerEmpty}>No tienes carpetas creadas.</Text>
                  )}
                </>
              )}

              {pickerMode === 'channel' && (
                <>
                  {channels.map((channel) => {
                    const sel = selectedChannelIds.has(channel.id);
                    return (
                      <TouchableOpacity
                        key={channel.id}
                        style={[styles.pickerItem, sel && styles.pickerItemSel]}
                        onPress={() => setSelectedChannelIds(toggleId(selectedChannelIds, channel.id))}
                      >
                        <View style={[styles.pickerCheck, sel && styles.pickerCheckSel]}>
                          {sel && <Ionicons name="checkmark" size={12} color="#FFF" />}
                        </View>
                        <Ionicons name="chatbubble-outline" size={16} color={COLORS.textSecondary} />
                        <Text style={styles.pickerItemTitle}>{channel.name}</Text>
                      </TouchableOpacity>
                    );
                  })}
                  {channels.length === 0 && (
                    <Text style={styles.pickerEmpty}>No hay canales disponibles.</Text>
                  )}
                </>
              )}
            </ScrollView>

            {/* Confirm */}
            <AnimatedPressable onPress={handleConfirm} style={styles.pickerConfirmBtn}>
              <Text style={styles.pickerConfirmText}>Aplicar</Text>
            </AnimatedPressable>
          </View>
        </Animated.View>
      )}
    </>
  );
}

// ── Main Modal ─────────────────────────────────────────────────────────────

export default function AIChatModal({ visible, onClose }: AIChatModalProps) {
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  const [context, setContext] = useState<ChatContextSelection>({
    type: 'all',
    label: 'Todas mis notas',
  });

  // Pull notes, folders, channels for the picker
  const notes = useNotesStore((s) => s.notes);
  const folders = useNotesStore((s) => s.folders);
  const channels = useWorkspaceStore((s) => s.channels);

  const handleSend = async () => {
    const question = input.trim();
    if (!question || loading) return;

    hapticButtonPress();
    const userMsg: Message = { id: `u-${Date.now()}`, role: 'user', text: question };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('chat-notes', {
        body: {
          question,
          context_type: context.type,
          note_ids: context.note_ids,
          folder_ids: context.folder_ids,
          channel_ids: context.channel_ids,
        },
      });

      if (error) throw error;

      const assistantMsg: Message = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        text: data?.answer ?? 'No pude encontrar una respuesta.',
        sources: data?.sources,
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { id: `e-${Date.now()}`, role: 'assistant', text: 'Error al procesar. Intenta de nuevo.' },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    onClose();
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const isUser = item.role === 'user';
    return (
      <Animated.View
        entering={FadeInDown.springify().damping(14)}
        style={[styles.msgRow, isUser && styles.msgRowUser]}
      >
        {!isUser && (
          <View style={styles.aiAvatar}>
            <Ionicons name="sparkles" size={14} color={COLORS.primaryLight} />
          </View>
        )}
        <View style={[styles.msgBubble, isUser ? styles.userBubble : styles.aiBubble]}>
          <Text style={[styles.msgText, isUser && styles.userText]}>{item.text}</Text>
          {item.sources && item.sources.length > 0 && (
            <View style={styles.sourcesRow}>
              {item.sources.map((noteId) => (
                <TouchableOpacity
                  key={noteId}
                  onPress={() => { onClose(); router.push(`/note/${noteId}`); }}
                  style={styles.sourceChip}
                >
                  <Ionicons name="document-outline" size={10} color={COLORS.primaryLight} />
                  <Text style={styles.sourceText}>Ver nota</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      </Animated.View>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        style={[styles.container, { paddingTop: insets.top }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        {/* Header */}
        <View style={styles.header}>
          <AnimatedPressable onPress={handleClose} style={styles.closeBtn}>
            <Ionicons name="chevron-down" size={24} color={COLORS.textSecondary} />
          </AnimatedPressable>
          <View style={styles.headerCenter}>
            <Ionicons name="sparkles" size={16} color={COLORS.primaryLight} />
            <Text style={styles.headerTitle}>Sythio AI</Text>
          </View>
          <View style={{ width: 40 }} />
        </View>

        {/* Context picker bar */}
        <ContextPicker
          context={context}
          onChange={setContext}
          notes={notes}
          folders={folders}
          channels={channels}
        />

        {/* Messages */}
        {messages.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <Ionicons name="chatbubbles-outline" size={40} color={COLORS.primaryLight} />
            </View>
            <Text style={styles.emptyTitle}>Pregunta sobre tus notas</Text>
            <Text style={styles.emptyDesc}>
              Puedo buscar en {context.type === 'all' ? 'todas tus grabaciones' : context.label.toLowerCase()}, resúmenes y tareas.
            </Text>
            <View style={styles.suggestions}>
              {['¿Qué pendientes tengo?', '¿De qué hablamos en la última reunión?', '¿Cuáles son mis ideas recientes?'].map((s) => (
                <TouchableOpacity
                  key={s}
                  onPress={() => { setInput(s); }}
                  style={styles.suggestionChip}
                >
                  <Text style={styles.suggestionText}>{s}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            renderItem={renderMessage}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.messagesList}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
          />
        )}

        {/* Loading indicator */}
        {loading && (
          <View style={styles.loadingRow}>
            <View style={styles.aiAvatar}>
              <Ionicons name="sparkles" size={14} color={COLORS.primaryLight} />
            </View>
            <View style={styles.loadingBubble}>
              <ActivityIndicator size="small" color={COLORS.primaryLight} />
              <Text style={styles.loadingText}>Buscando en {context.label.toLowerCase()}...</Text>
            </View>
          </View>
        )}

        {/* Input */}
        <View style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <TextInput
            style={styles.input}
            placeholder="Pregunta algo..."
            placeholderTextColor={COLORS.textMuted}
            value={input}
            onChangeText={setInput}
            multiline
            maxLength={500}
            returnKeyType="send"
            onSubmitEditing={handleSend}
            blurOnSubmit={false}
          />
          <AnimatedPressable
            onPress={handleSend}
            disabled={!input.trim() || loading}
            style={[styles.sendBtn, (!input.trim() || loading) && styles.sendBtnDisabled]}
          >
            <Ionicons name="arrow-up" size={20} color="#FFFFFF" />
          </AnimatedPressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },

  // Context bar
  contextBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
    backgroundColor: COLORS.surfaceAlt,
  },
  contextLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.textSecondary,
  },

  // Picker overlay
  pickerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
    zIndex: 100,
  },
  pickerSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '75%',
    paddingBottom: 30,
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 8,
  },
  pickerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  pickerTabs: {
    paddingHorizontal: 16,
    marginVertical: 8,
    maxHeight: 44,
  },
  pickerTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 9999,
    marginRight: 6,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  pickerTabActive: {
    backgroundColor: COLORS.primaryPale,
    borderColor: COLORS.primaryLight,
  },
  pickerTabText: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.textSecondary,
  },
  pickerTabTextActive: {
    color: COLORS.primaryLight,
    fontWeight: '600',
  },
  pickerContent: {
    paddingHorizontal: 16,
    maxHeight: 320,
  },
  pickerInfo: {
    alignItems: 'center',
    paddingVertical: 32,
    gap: 10,
  },
  pickerInfoText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 4,
  },
  pickerItemSel: {
    backgroundColor: COLORS.primaryPale,
  },
  pickerCheck: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pickerCheckSel: {
    backgroundColor: COLORS.primaryLight,
    borderColor: COLORS.primaryLight,
  },
  pickerItemContent: {
    flex: 1,
  },
  pickerItemTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.textPrimary,
  },
  pickerItemSub: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 1,
  },
  folderDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  pickerEmpty: {
    textAlign: 'center',
    fontSize: 14,
    color: COLORS.textMuted,
    paddingVertical: 24,
  },
  pickerConfirmBtn: {
    backgroundColor: COLORS.primary,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  pickerConfirmText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // Empty state
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.surfaceAlt,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 8,
  },
  emptyDesc: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  suggestions: {
    gap: 8,
    width: '100%',
  },
  suggestionChip: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: COLORS.surfaceAlt,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  suggestionText: {
    fontSize: 14,
    color: COLORS.textPrimary,
  },

  // Messages
  messagesList: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  msgRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
    gap: 8,
    maxWidth: '85%',
  },
  msgRowUser: {
    alignSelf: 'flex-end',
    flexDirection: 'row-reverse',
  },
  aiAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.surfaceAlt,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  msgBubble: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxWidth: '100%',
  },
  userBubble: {
    backgroundColor: COLORS.primary,
    borderBottomRightRadius: 4,
  },
  aiBubble: {
    backgroundColor: COLORS.surfaceAlt,
    borderBottomLeftRadius: 4,
  },
  msgText: {
    fontSize: 15,
    lineHeight: 22,
    color: COLORS.textPrimary,
  },
  userText: {
    color: '#FFFFFF',
  },
  sourcesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  sourceChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: COLORS.primaryPale,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  sourceText: {
    fontSize: 11,
    color: COLORS.primaryLight,
    fontWeight: '500',
  },

  // Loading
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  loadingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.surfaceAlt,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  loadingText: {
    fontSize: 13,
    color: COLORS.textMuted,
  },

  // Input
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
    gap: 8,
  },
  input: {
    flex: 1,
    minHeight: 42,
    maxHeight: 100,
    backgroundColor: COLORS.surfaceAlt,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    color: COLORS.textPrimary,
  },
  sendBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 2,
  },
  sendBtnDisabled: {
    opacity: 0.3,
  },
});
