import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@/lib/constants';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useNotesStore } from '@/stores/notesStore';
import { hapticButtonPress } from '@/lib/haptics';
import { showToast } from '@/components/Toast';

interface NoteImagesProps {
  noteId: string;
  images: string[];
}

const SUPABASE_URL = 'https://oewjbeqwihhzuvbsfctf.supabase.co';

function getPublicUrl(path: string): string {
  return `${SUPABASE_URL}/storage/v1/object/public/note-images/${path}`;
}

export default function NoteImages({ noteId, images }: NoteImagesProps) {
  const [uploading, setUploading] = useState(false);
  const { user } = useAuthStore();

  const handlePickImage = useCallback(async () => {
    if (!user) return;
    hapticButtonPress();

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permiso requerido', 'Necesitamos acceso a tu galería para adjuntar imágenes.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
      allowsMultipleSelection: false,
    });

    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    setUploading(true);

    try {
      const ext = asset.uri.split('.').pop() || 'jpg';
      const fileName = `${user.id}/${noteId}_${Date.now()}.${ext}`;

      const response = await fetch(asset.uri);
      const blob = await response.blob();

      const { error: uploadError } = await supabase.storage
        .from('note-images')
        .upload(fileName, blob, { contentType: asset.mimeType || 'image/jpeg' });

      if (uploadError) throw uploadError;

      // Update note images array
      const updatedImages = [...images, fileName];
      await useNotesStore.getState().updateNote(noteId, { images: updatedImages } as any);
      showToast('Imagen adjuntada', 'success');
    } catch {
      showToast('Error al subir imagen', 'error');
    } finally {
      setUploading(false);
    }
  }, [user, noteId, images]);

  const handleRemoveImage = useCallback((path: string) => {
    Alert.alert('Eliminar imagen', '¿Quieres quitar esta imagen?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          await supabase.storage.from('note-images').remove([path]);
          const updated = images.filter(i => i !== path);
          await useNotesStore.getState().updateNote(noteId, { images: updated } as any);
          showToast('Imagen eliminada', 'info');
        },
      },
    ]);
  }, [noteId, images]);

  const handleTakePhoto = useCallback(async () => {
    if (!user) return;
    hapticButtonPress();

    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permiso requerido', 'Necesitamos acceso a tu cámara.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      quality: 0.7,
    });

    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    setUploading(true);

    try {
      const fileName = `${user.id}/${noteId}_${Date.now()}.jpg`;
      const response = await fetch(asset.uri);
      const blob = await response.blob();

      const { error: uploadError } = await supabase.storage
        .from('note-images')
        .upload(fileName, blob, { contentType: 'image/jpeg' });

      if (uploadError) throw uploadError;

      const updatedImages = [...images, fileName];
      await useNotesStore.getState().updateNote(noteId, { images: updatedImages } as any);
      showToast('Foto adjuntada', 'success');
    } catch {
      showToast('Error al subir foto', 'error');
    } finally {
      setUploading(false);
    }
  }, [user, noteId, images]);

  return (
    <View style={styles.container}>
      {/* Image gallery */}
      {images.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.gallery}>
          {images.map((path, idx) => (
            <TouchableOpacity key={idx} onLongPress={() => handleRemoveImage(path)} activeOpacity={0.8}>
              <Image
                source={{ uri: getPublicUrl(path) }}
                style={styles.thumbnail}
                cachePolicy="memory-disk"
                contentFit="cover"
                transition={150}
              />
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Add buttons */}
      <View style={styles.addRow}>
        <TouchableOpacity style={styles.addBtn} onPress={handlePickImage} disabled={uploading}>
          {uploading ? (
            <ActivityIndicator size="small" color={COLORS.primaryLight} />
          ) : (
            <>
              <Ionicons name="image-outline" size={16} color={COLORS.primaryLight} />
              <Text style={styles.addText}>Galería</Text>
            </>
          )}
        </TouchableOpacity>
        <TouchableOpacity style={styles.addBtn} onPress={handleTakePhoto} disabled={uploading}>
          <Ionicons name="camera-outline" size={16} color={COLORS.primaryLight} />
          <Text style={styles.addText}>Cámara</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 24,
    marginBottom: 8,
  },
  gallery: {
    gap: 8,
    paddingBottom: 8,
  },
  thumbnail: {
    width: 80,
    height: 80,
    borderRadius: 10,
    backgroundColor: COLORS.surfaceAlt,
  },
  addRow: {
    flexDirection: 'row',
    gap: 8,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: COLORS.surfaceAlt,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    borderStyle: 'dashed',
  },
  addText: {
    fontSize: 13,
    color: COLORS.primaryLight,
    fontWeight: '500',
  },
});
