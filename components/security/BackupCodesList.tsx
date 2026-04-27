/**
 * BackupCodesList — render 8 backup codes in a 2-column grid with copy/share.
 *
 * Backup codes are shown ONCE after enrollment. We strongly prompt the user to
 * save them (clipboard + share sheet to save to Files / send to themselves).
 */

import { View, StyleSheet, Pressable } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/primitives/Text';
import { Surface } from '@/components/primitives/Surface';
import { Button } from '@/components/primitives/Button';
import { useTheme } from '@/lib/design/tokens';
import { showToast } from '@/components/Toast';
import * as Haptics from 'expo-haptics';

interface Props {
  codes: string[];
}

export function BackupCodesList({ codes }: Props) {
  const t = useTheme();

  const copyAll = async () => {
    await Clipboard.setStringAsync(codes.join('\n'));
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    showToast('Códigos copiados al portapapeles', 'success');
  };

  const downloadFile = async () => {
    try {
      const file = new File(Paths.cache, 'sythio-backup-codes.txt');
      const content =
        'SYTHIO — Códigos de respaldo de 2FA\n' +
        '====================================\n\n' +
        'Guarda estos códigos en un lugar seguro. Cada uno se puede usar UNA SOLA VEZ\n' +
        'para iniciar sesión si pierdes acceso a tu app de autenticación.\n\n' +
        codes.map((c, i) => `${i + 1}. ${c}`).join('\n') +
        '\n\nGenerados el ' + new Date().toLocaleString('es-ES');
      file.write(content);
      const available = await Sharing.isAvailableAsync();
      if (available) {
        await Sharing.shareAsync(file.uri, {
          mimeType: 'text/plain',
          dialogTitle: 'Guardar códigos de respaldo',
        });
      } else {
        await Clipboard.setStringAsync(content);
        showToast('Compartir no disponible. Códigos copiados.', 'info');
      }
    } catch (err) {
      console.warn('[BackupCodesList] download error:', err);
      showToast('No se pudo generar el archivo', 'error');
    }
  };

  return (
    <Surface variant="elevated" padding={5} radius="xl" border="subtle">
      <View style={styles.headerRow}>
        <Ionicons name="key" size={18} color={t.accentPrimary} />
        <Text variant="body-strong">Códigos de respaldo</Text>
      </View>
      <Text variant="callout" tone="secondary" style={{ marginTop: 4, marginBottom: 16 }}>
        Guarda estos códigos. Te servirán si pierdes acceso a tu app de autenticación. Cada código solo se puede usar una vez.
      </Text>

      <View style={styles.grid}>
        {codes.map((code, i) => (
          <Pressable
            key={code}
            onPress={async () => {
              await Clipboard.setStringAsync(code);
              Haptics.selectionAsync().catch(() => undefined);
              showToast('Código copiado', 'success');
            }}
            style={({ pressed }) => [
              styles.code,
              {
                backgroundColor: t.bg.secondary,
                borderColor: t.border.subtle,
                opacity: pressed ? 0.6 : 1,
              },
            ]}
          >
            <Text variant="caption" tone="tertiary" style={{ marginRight: 8 }}>
              {String(i + 1).padStart(2, '0')}
            </Text>
            <Text variant="mono" style={{ fontSize: 14, letterSpacing: 1 }}>
              {code}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.actions}>
        <Button
          label="Copiar todos"
          variant="secondary"
          size="md"
          fullWidth
          leadingIcon={<Ionicons name="copy-outline" size={18} color={t.text.primary} />}
          onPress={copyAll}
        />
        <Button
          label="Descargar"
          variant="secondary"
          size="md"
          fullWidth
          leadingIcon={<Ionicons name="download-outline" size={18} color={t.text.primary} />}
          onPress={downloadFile}
        />
      </View>
    </Surface>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  code: {
    width: '48%',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
  },
});
