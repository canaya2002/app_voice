import { useState, useRef } from 'react';
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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { COLORS } from '@/lib/constants';
import { supabase } from '@/lib/supabase';
import AnimatedPressable from './AnimatedPressable';
import { hapticButtonPress } from '@/lib/haptics';
import { router } from 'expo-router';

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

export default function AIChatModal({ visible, onClose }: AIChatModalProps) {
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const flatListRef = useRef<FlatList>(null);

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
        body: { question },
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

        {/* Messages */}
        {messages.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <Ionicons name="chatbubbles-outline" size={40} color={COLORS.primaryLight} />
            </View>
            <Text style={styles.emptyTitle}>Pregunta sobre tus notas</Text>
            <Text style={styles.emptyDesc}>
              Puedo buscar en todas tus grabaciones, resúmenes y tareas.
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
              <Text style={styles.loadingText}>Buscando en tus notas...</Text>
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
    borderBottomColor: COLORS.borderLight,
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
    backgroundColor: 'rgba(143,211,255,0.15)',
    borderRadius: 6,
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
