import { View, Text, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '@/lib/constants';
import AnimatedPressable from '@/components/AnimatedPressable';

export default function NotFoundScreen() {
  const colors = useThemeColors();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.content}>
        <Ionicons name="compass-outline" size={64} color={colors.textMuted} />
        <Text style={[styles.title, { color: colors.textPrimary }]}>
          Página no encontrada
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          La ruta que buscas no existe.
        </Text>
        <AnimatedPressable
          onPress={() => router.replace('/(tabs)')}
          style={[styles.button, { backgroundColor: colors.primary }]}
        >
          <Text style={styles.buttonText}>Ir al inicio</Text>
        </AnimatedPressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    marginTop: 8,
  },
  subtitle: {
    fontSize: 15,
    textAlign: 'center',
  },
  button: {
    marginTop: 20,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 16,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
