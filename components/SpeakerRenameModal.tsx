import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  StyleSheet,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  ScrollView,
} from 'react-native';
import { COLORS } from '@/lib/constants';
import { getSpeakerColor, getSpeakerDisplayName } from '@/lib/speaker-utils';
import type { SpeakerInfo } from '@/types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface SpeakerRenameModalProps {
  visible: boolean;
  speakers: SpeakerInfo[];
  onSave: (updated: SpeakerInfo[]) => void;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SpeakerRenameModal({
  visible,
  speakers,
  onSave,
  onClose,
}: SpeakerRenameModalProps) {
  // Local draft of names, keyed by speaker id
  const [names, setNames] = useState<Record<string, string>>({});

  // Reset local state whenever the modal opens or speakers change
  useEffect(() => {
    if (visible) {
      const initial: Record<string, string> = {};
      speakers.forEach((s) => {
        initial[s.id] = getSpeakerDisplayName(s);
      });
      setNames(initial);
    }
  }, [visible, speakers]);

  const handleNameChange = (speakerId: string, value: string) => {
    setNames((prev) => ({ ...prev, [speakerId]: value }));
  };

  const handleSave = () => {
    const updated: SpeakerInfo[] = speakers.map((speaker) => {
      const editedName = (names[speaker.id] ?? '').trim();
      // Only set custom_name if the user actually typed something different
      const customName =
        editedName.length > 0 && editedName !== speaker.default_name
          ? editedName
          : undefined;
      return {
        ...speaker,
        custom_name: customName,
      };
    });
    onSave(updated);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Tap outside to close */}
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={() => { Keyboard.dismiss(); onClose(); }}
          accessibilityLabel="Cerrar modal"
        />

        {/* Bottom sheet */}
        <View style={styles.sheet}>
          {/* Handle indicator */}
          <View style={styles.handleRow}>
            <View style={styles.handle} />
          </View>

          {/* Title */}
          <Text style={styles.title}>Renombrar hablantes</Text>

          {/* Speaker list */}
          <ScrollView
            style={styles.speakerList}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {speakers.map((speaker, speakerIndex) => {
              const color = getSpeakerColor(speaker.color);
              return (
                <View key={speaker.id} style={styles.speakerRow}>
                  {/* Colored circle indicator */}
                  <View
                    style={[
                      styles.colorCircle,
                      { backgroundColor: color.text },
                    ]}
                  />

                  {/* Name input */}
                  <TextInput
                    style={[styles.nameInput, { borderColor: color.text + '40' }]}
                    value={names[speaker.id] ?? ''}
                    onChangeText={(value) =>
                      handleNameChange(speaker.id, value)
                    }
                    placeholder={speaker.default_name}
                    placeholderTextColor={COLORS.textMuted}
                    autoCapitalize="words"
                    autoFocus={speakerIndex === 0}
                    returnKeyType="done"
                    onSubmitEditing={handleSave}
                    maxLength={30}
                  />
                </View>
              );
            })}
          </ScrollView>

          {/* Actions */}
          <TouchableOpacity
            style={styles.saveButton}
            onPress={handleSave}
            activeOpacity={0.8}
            accessibilityLabel="Guardar nombres"
          >
            <Text style={styles.saveButtonText}>Guardar</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.cancelButton}
            onPress={onClose}
            activeOpacity={0.6}
            accessibilityLabel="Cancelar"
          >
            <Text style={styles.cancelButtonText}>Cancelar</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },

  // -- Bottom sheet ----------------------------------------------------------
  sheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
  },
  handleRow: {
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 8,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.border,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
    textAlign: 'center',
    marginBottom: 20,
  },

  // -- Speaker rows ----------------------------------------------------------
  speakerList: {
    maxHeight: 300,
    marginBottom: 20,
  },
  speakerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    gap: 12,
  },
  colorCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  nameInput: {
    flex: 1,
    height: 44,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 15,
    color: COLORS.textPrimary,
    backgroundColor: COLORS.background,
  },

  // -- Actions ---------------------------------------------------------------
  saveButton: {
    backgroundColor: COLORS.primary,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  cancelButton: {
    marginTop: 12,
    paddingVertical: 8,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: COLORS.textSecondary,
    fontSize: 14,
    fontWeight: '500',
  },
});
