import { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@/lib/constants';
import { exportPDF, copyToClipboard } from '@/lib/export';
import type { Note } from '@/types';

interface ExportButtonProps {
  note: Note;
}

export default function ExportButton({ note }: ExportButtonProps) {
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleExportPDF = async () => {
    setLoading(true);
    try {
      await exportPDF(note);
    } catch (err) {
      // PDF export failed — user sees loading state reset
    } finally {
      setLoading(false);
      setVisible(false);
    }
  };

  const handleCopyText = async () => {
    await copyToClipboard(note);
    setVisible(false);
  };

  return (
    <>
      <TouchableOpacity
        style={styles.fab}
        onPress={() => setVisible(true)}
        accessibilityLabel="Exportar nota"
      >
        <Ionicons name="share-outline" size={22} color="#FFFFFF" />
      </TouchableOpacity>

      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={() => setVisible(false)}
      >
        <Pressable style={styles.overlay} onPress={() => setVisible(false)}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Exportar nota</Text>

            <TouchableOpacity
              style={styles.option}
              onPress={handleExportPDF}
              disabled={loading}
            >
              <Ionicons name="document-outline" size={22} color={COLORS.primary} />
              <View style={styles.optionText}>
                <Text style={styles.optionTitle}>Compartir PDF</Text>
                <Text style={styles.optionDesc}>Genera un PDF con toda la información</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={styles.option} onPress={handleCopyText}>
              <Ionicons name="copy-outline" size={22} color={COLORS.primary} />
              <View style={styles.optionText}>
                <Text style={styles.optionTitle}>Copiar texto</Text>
                <Text style={styles.optionDesc}>Copia el contenido al portapapeles</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => setVisible(false)}
            >
              <Text style={styles.cancelText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: COLORS.primaryDark,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 40,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 20,
    textAlign: 'center',
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    backgroundColor: COLORS.surfaceAlt,
    marginBottom: 10,
    gap: 14,
  },
  optionText: {
    flex: 1,
  },
  optionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  optionDesc: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  cancelButton: {
    alignItems: 'center',
    paddingVertical: 14,
    marginTop: 6,
  },
  cancelText: {
    fontSize: 15,
    color: COLORS.textMuted,
    fontWeight: '500',
  },
});
