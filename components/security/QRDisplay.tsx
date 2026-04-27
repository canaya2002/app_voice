/**
 * QRDisplay — shows a TOTP enrollment QR code provided by Supabase.
 *
 * Supabase returns the QR as a URL or base64 string. We render via Image,
 * with a copyable secret underneath as fallback for users who can't scan.
 */

import { View, StyleSheet, Image, Pressable } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { Surface } from '@/components/primitives/Surface';
import { Text } from '@/components/primitives/Text';
import { useTheme } from '@/lib/design/tokens';
import { showToast } from '@/components/Toast';
import * as Haptics from 'expo-haptics';

interface Props {
  qrSource: string;   // data: URL or remote URL
  secret: string;
}

export function QRDisplay({ qrSource, secret }: Props) {
  const t = useTheme();

  const copy = async () => {
    await Clipboard.setStringAsync(secret);
    Haptics.selectionAsync().catch(() => undefined);
    showToast('Secret copiado', 'success');
  };

  return (
    <Surface variant="elevated" padding={5} radius="xl" border="subtle">
      <View style={styles.qrWrap}>
        <View style={[styles.qrBox, { backgroundColor: '#FFFFFF', borderColor: t.border.default }]}>
          <Image source={{ uri: qrSource }} style={styles.qr} resizeMode="contain" />
        </View>
      </View>

      <Text variant="caption" tone="tertiary" align="center" style={{ marginTop: 12, marginBottom: 4 }}>
        ¿NO PUEDES ESCANEAR?
      </Text>
      <Pressable
        onPress={copy}
        style={({ pressed }) => [
          styles.secretBtn,
          { backgroundColor: t.bg.secondary, borderColor: t.border.subtle, opacity: pressed ? 0.6 : 1 },
        ]}
      >
        <Text variant="mono" style={{ fontSize: 14, letterSpacing: 1, flex: 1 }}>
          {secret}
        </Text>
        <Ionicons name="copy-outline" size={18} color={t.text.secondary} />
      </Pressable>
    </Surface>
  );
}

const styles = StyleSheet.create({
  qrWrap: {
    alignItems: 'center',
  },
  qrBox: {
    width: 220,
    height: 220,
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qr: {
    width: '100%',
    height: '100%',
  },
  secretBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
  },
});
