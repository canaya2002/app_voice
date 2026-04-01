import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { COLORS } from '@/lib/constants';
import AnimatedPressable from '@/components/AnimatedPressable';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { useAuthStore } from '@/stores/authStore';
import { showToast } from '@/components/Toast';
import { hapticButtonPress, hapticSelection } from '@/lib/haptics';
import type { WorkspaceRole } from '@/types';

const ROLE_LABELS: Record<WorkspaceRole, string> = {
  owner: 'Propietario',
  admin: 'Admin',
  member: 'Miembro',
  viewer: 'Visor',
};

const ROLE_COLORS: Record<WorkspaceRole, string> = {
  owner: COLORS.accentGold,
  admin: COLORS.primaryLight,
  member: COLORS.textSecondary,
  viewer: COLORS.textMuted,
};

export default function WorkspaceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuthStore();
  const {
    workspaces, members, channels,
    fetchMembers, fetchChannels,
    inviteMember, removeMember, updateMemberRole,
    createChannel, deleteChannel,
    setCurrentWorkspace,
  } = useWorkspaceStore();

  const workspace = workspaces.find((w) => w.id === id);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<WorkspaceRole>('member');
  const [inviting, setInviting] = useState(false);
  const [showNewChannel, setShowNewChannel] = useState(false);
  const [channelName, setChannelName] = useState('');
  const [creatingChannel, setCreatingChannel] = useState(false);

  useEffect(() => {
    if (id) {
      fetchMembers(id);
      fetchChannels(id);
      if (workspace) setCurrentWorkspace(workspace);
    }
  }, [id, fetchMembers, fetchChannels, workspace, setCurrentWorkspace]);

  const isOwnerOrAdmin = members.some(
    (m) => m.user_id === user?.id && (m.role === 'owner' || m.role === 'admin'),
  );

  const handleInvite = useCallback(async () => {
    if (!inviteEmail.trim() || !id) return;
    setInviting(true);
    const ok = await inviteMember(id, inviteEmail.trim(), inviteRole);
    setInviting(false);
    if (ok) {
      setShowInvite(false);
      setInviteEmail('');
      showToast('Miembro invitado', 'success');
    } else {
      showToast('No se encontró el usuario o ya es miembro', 'error');
    }
  }, [inviteEmail, inviteRole, id, inviteMember]);

  const handleCreateChannel = useCallback(async () => {
    if (!channelName.trim() || !id) return;
    setCreatingChannel(true);
    const ch = await createChannel(id, channelName.trim());
    setCreatingChannel(false);
    if (ch) {
      setShowNewChannel(false);
      setChannelName('');
      showToast('Canal creado', 'success');
    }
  }, [channelName, id, createChannel]);

  if (!workspace) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <Text style={{ color: COLORS.textMuted }}>Workspace no encontrado</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <AnimatedPressable onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={COLORS.textPrimary} />
        </AnimatedPressable>
        <View style={{ flex: 1, marginHorizontal: 12 }}>
          <Text style={styles.title} numberOfLines={1}>{workspace.name}</Text>
          {workspace.description ? <Text style={styles.subtitle} numberOfLines={1}>{workspace.description}</Text> : null}
        </View>
        {isOwnerOrAdmin && (
          <AnimatedPressable onPress={() => { hapticButtonPress(); setShowInvite(true); }}>
            <Ionicons name="person-add-outline" size={22} color={COLORS.primaryLight} />
          </AnimatedPressable>
        )}
      </View>

      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 100 }}>
        {/* Members section */}
        <Animated.View entering={FadeInDown.delay(100)}>
          <Text style={styles.sectionTitle}>
            <Ionicons name="people-outline" size={16} color={COLORS.primary} /> Miembros ({members.length})
          </Text>
          <View style={styles.memberList}>
            {members.map((member) => (
              <View key={member.id} style={styles.memberCard}>
                <View style={styles.memberAvatar}>
                  <Text style={styles.memberInitial}>
                    {(member.display_name || member.email || '?')[0].toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.memberName}>{member.display_name || member.email || 'Sin nombre'}</Text>
                  {member.email && <Text style={styles.memberEmail}>{member.email}</Text>}
                </View>
                <View style={[styles.roleBadge, { backgroundColor: ROLE_COLORS[member.role] + '20' }]}>
                  <Text style={[styles.roleBadgeText, { color: ROLE_COLORS[member.role] }]}>
                    {ROLE_LABELS[member.role]}
                  </Text>
                </View>
                {isOwnerOrAdmin && member.user_id !== user?.id && member.role !== 'owner' && (
                  <TouchableOpacity
                    onPress={() => {
                      Alert.alert('Opciones', '', [
                        { text: 'Cancelar', style: 'cancel' },
                        { text: 'Hacer Admin', onPress: () => updateMemberRole(member.id, 'admin') },
                        { text: 'Hacer Visor', onPress: () => updateMemberRole(member.id, 'viewer') },
                        {
                          text: 'Eliminar', style: 'destructive',
                          onPress: () => removeMember(member.id),
                        },
                      ]);
                    }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="ellipsis-vertical" size={16} color={COLORS.textMuted} />
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </View>
        </Animated.View>

        {/* Channels section */}
        <Animated.View entering={FadeInDown.delay(200)} style={{ marginTop: 28 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={styles.sectionTitle}>
              <Ionicons name="chatbubbles-outline" size={16} color={COLORS.primary} /> Canales ({channels.length})
            </Text>
            {isOwnerOrAdmin && (
              <TouchableOpacity onPress={() => setShowNewChannel(true)}>
                <Ionicons name="add-circle-outline" size={22} color={COLORS.primaryLight} />
              </TouchableOpacity>
            )}
          </View>

          {channels.length === 0 ? (
            <View style={styles.emptyChannels}>
              <Ionicons name="chatbubbles-outline" size={32} color={COLORS.borderLight} />
              <Text style={styles.emptyText}>Sin canales aún</Text>
            </View>
          ) : (
            <View style={{ gap: 8, marginTop: 12 }}>
              {channels.map((channel) => (
                <TouchableOpacity
                  key={channel.id}
                  style={styles.channelCard}
                  activeOpacity={0.7}
                  onLongPress={() => {
                    if (!isOwnerOrAdmin) return;
                    Alert.alert('Eliminar canal', `¿Eliminar "${channel.name}"?`, [
                      { text: 'Cancelar', style: 'cancel' },
                      { text: 'Eliminar', style: 'destructive', onPress: () => deleteChannel(channel.id) },
                    ]);
                  }}
                >
                  <Ionicons
                    name={channel.is_public ? 'chatbubble-outline' : 'lock-closed-outline'}
                    size={18}
                    color={COLORS.primaryLight}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.channelName}># {channel.name}</Text>
                    {channel.description ? <Text style={styles.channelDesc} numberOfLines={1}>{channel.description}</Text> : null}
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </Animated.View>
      </ScrollView>

      {/* Invite modal */}
      <Modal visible={showInvite} transparent animationType="fade" onRequestClose={() => setShowInvite(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Invitar miembro</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Email del usuario"
              placeholderTextColor={COLORS.textMuted}
              value={inviteEmail}
              onChangeText={setInviteEmail}
              autoFocus
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              {(['member', 'admin', 'viewer'] as WorkspaceRole[]).map((r) => (
                <TouchableOpacity
                  key={r}
                  onPress={() => { hapticSelection(); setInviteRole(r); }}
                  style={[styles.roleChip, inviteRole === r && styles.roleChipActive]}
                >
                  <Text style={[styles.roleChipText, inviteRole === r && { color: '#FFF' }]}>{ROLE_LABELS[r]}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setShowInvite(false)} style={styles.modalCancelBtn}>
                <Text style={styles.modalCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleInvite}
                disabled={!inviteEmail.trim() || inviting}
                style={[styles.modalCreateBtn, !inviteEmail.trim() && { opacity: 0.4 }]}
              >
                {inviting ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={styles.modalCreateText}>Invitar</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* New channel modal */}
      <Modal visible={showNewChannel} transparent animationType="fade" onRequestClose={() => setShowNewChannel(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Nuevo canal</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Nombre del canal"
              placeholderTextColor={COLORS.textMuted}
              value={channelName}
              onChangeText={setChannelName}
              autoFocus
              maxLength={40}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setShowNewChannel(false)} style={styles.modalCancelBtn}>
                <Text style={styles.modalCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleCreateChannel}
                disabled={!channelName.trim() || creatingChannel}
                style={[styles.modalCreateBtn, !channelName.trim() && { opacity: 0.4 }]}
              >
                {creatingChannel ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={styles.modalCreateText}>Crear</Text>}
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
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: COLORS.borderLight,
  },
  title: { fontSize: 20, fontWeight: '700', color: COLORS.textPrimary },
  subtitle: { fontSize: 13, color: COLORS.textMuted, marginTop: 2 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: COLORS.textPrimary, marginBottom: 12 },
  memberList: { gap: 8 },
  memberCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: COLORS.surfaceAlt, borderRadius: 12, padding: 12,
  },
  memberAvatar: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: COLORS.primaryPale, justifyContent: 'center', alignItems: 'center',
  },
  memberInitial: { fontSize: 14, fontWeight: '700', color: COLORS.primaryLight },
  memberName: { fontSize: 14, fontWeight: '600', color: COLORS.textPrimary },
  memberEmail: { fontSize: 12, color: COLORS.textMuted },
  roleBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  roleBadgeText: { fontSize: 11, fontWeight: '600' },
  emptyChannels: { alignItems: 'center', gap: 8, paddingVertical: 24 },
  emptyText: { fontSize: 14, color: COLORS.textMuted },
  channelCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: COLORS.surfaceAlt, borderRadius: 12, padding: 14,
  },
  channelName: { fontSize: 15, fontWeight: '600', color: COLORS.textPrimary },
  channelDesc: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  roleChip: {
    flex: 1, paddingVertical: 8, borderRadius: 8,
    backgroundColor: COLORS.surfaceAlt, alignItems: 'center',
  },
  roleChipActive: { backgroundColor: COLORS.primary },
  roleChipText: { fontSize: 13, fontWeight: '500', color: COLORS.textSecondary },
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
