import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { COLORS } from '@/lib/constants';
import AnimatedPressable from '@/components/AnimatedPressable';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { showToast } from '@/components/Toast';
import { hapticButtonPress } from '@/lib/haptics';
import type { Workspace } from '@/types';

export default function WorkspaceListScreen() {
  const { workspaces, loading, fetchWorkspaces, createWorkspace, deleteWorkspace } = useWorkspaceStore();
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => { fetchWorkspaces(); }, [fetchWorkspaces]);

  const handleCreate = useCallback(async () => {
    if (!name.trim()) return;
    setCreating(true);
    const ws = await createWorkspace(name.trim(), description.trim());
    setCreating(false);
    if (ws) {
      setShowCreate(false);
      setName('');
      setDescription('');
      showToast('Workspace creado', 'success');
    } else {
      showToast('Error al crear workspace', 'error');
    }
  }, [name, description, createWorkspace]);

  const handleDelete = useCallback((ws: Workspace) => {
    Alert.alert('Eliminar workspace', `¿Eliminar "${ws.name}"? Esto eliminará todos sus canales.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar', style: 'destructive',
        onPress: async () => {
          await deleteWorkspace(ws.id);
          showToast('Workspace eliminado', 'info');
        },
      },
    ]);
  }, [deleteWorkspace]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <AnimatedPressable onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={COLORS.textPrimary} />
        </AnimatedPressable>
        <Text style={styles.title}>Workspaces</Text>
        <AnimatedPressable onPress={() => { hapticButtonPress(); setShowCreate(true); }}>
          <Ionicons name="add-circle-outline" size={24} color={COLORS.primaryLight} />
        </AnimatedPressable>
      </View>

      {loading && workspaces.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.primaryLight} />
        </View>
      ) : workspaces.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="people-outline" size={48} color={COLORS.borderLight} />
          <Text style={styles.emptyTitle}>Sin workspaces</Text>
          <Text style={styles.emptyText}>Crea un workspace para colaborar con tu equipo.</Text>
          <TouchableOpacity style={styles.createBtn} onPress={() => setShowCreate(true)}>
            <Ionicons name="add" size={18} color="#FFF" />
            <Text style={styles.createBtnText}>Crear workspace</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={workspaces}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 24, gap: 12 }}
          renderItem={({ item, index }) => (
            <Animated.View entering={FadeInDown.delay(index * 80)}>
              <TouchableOpacity
                style={styles.card}
                activeOpacity={0.7}
                onPress={() => (router as any).push(`/workspace/${item.id}`)}
                onLongPress={() => handleDelete(item)}
              >
                <View style={styles.cardIcon}>
                  <Ionicons name="people" size={20} color={COLORS.primaryLight} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{item.name}</Text>
                  {item.description ? <Text style={styles.cardDesc} numberOfLines={1}>{item.description}</Text> : null}
                </View>
                <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
              </TouchableOpacity>
            </Animated.View>
          )}
        />
      )}

      {/* Create modal */}
      <Modal visible={showCreate} transparent animationType="fade" onRequestClose={() => setShowCreate(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Nuevo workspace</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Nombre del workspace"
              placeholderTextColor={COLORS.textMuted}
              value={name}
              onChangeText={setName}
              autoFocus
              maxLength={50}
            />
            <TextInput
              style={[styles.modalInput, { marginTop: 10 }]}
              placeholder="Descripción (opcional)"
              placeholderTextColor={COLORS.textMuted}
              value={description}
              onChangeText={setDescription}
              maxLength={200}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setShowCreate(false)} style={styles.modalCancelBtn}>
                <Text style={styles.modalCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleCreate}
                disabled={!name.trim() || creating}
                style={[styles.modalCreateBtn, !name.trim() && { opacity: 0.4 }]}
              >
                {creating ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={styles.modalCreateText}>Crear</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 12,
  },
  title: { fontSize: 22, fontWeight: '700', color: COLORS.textPrimary },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40, gap: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: COLORS.textSecondary },
  emptyText: { fontSize: 14, color: COLORS.textMuted, textAlign: 'center' },
  createBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: COLORS.primary, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 14, marginTop: 8,
  },
  createBtnText: { color: '#FFF', fontSize: 14, fontWeight: '600' },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: COLORS.surface, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: COLORS.borderLight,
  },
  cardIcon: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: COLORS.primaryPale, justifyContent: 'center', alignItems: 'center',
  },
  cardTitle: { fontSize: 16, fontWeight: '600', color: COLORS.textPrimary },
  cardDesc: { fontSize: 13, color: COLORS.textMuted, marginTop: 2 },
  // Modal
  modalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.4)', padding: 24 },
  modalSheet: { width: '100%', maxWidth: 360, backgroundColor: COLORS.surface, borderRadius: 20, padding: 24 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: COLORS.textPrimary, marginBottom: 16, textAlign: 'center' },
  modalInput: {
    height: 48, borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 12,
    paddingHorizontal: 14, fontSize: 15, color: COLORS.textPrimary,
  },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 20 },
  modalCancelBtn: {
    flex: 1, height: 44, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border,
    justifyContent: 'center', alignItems: 'center',
  },
  modalCancelText: { fontSize: 14, color: COLORS.textSecondary, fontWeight: '500' },
  modalCreateBtn: {
    flex: 1, height: 44, borderRadius: 12, backgroundColor: COLORS.primary,
    justifyContent: 'center', alignItems: 'center',
  },
  modalCreateText: { fontSize: 14, color: '#FFFFFF', fontWeight: '600' },
});
