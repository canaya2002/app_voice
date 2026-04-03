import React, { useEffect, useRef, useCallback, useState } from 'react';
import { View, Text, StyleSheet, Animated, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '@/lib/constants';

type ToastType = 'success' | 'error' | 'info';

interface ToastMessage {
  id: number;
  text: string;
  type: ToastType;
}

let toastId = 0;
const listeners: Set<(msg: ToastMessage) => void> = new Set();

export function showToast(text: string, type: ToastType = 'success') {
  const msg: ToastMessage = { id: ++toastId, text, type };
  listeners.forEach((fn) => fn(msg));
}

interface ToastItemProps {
  message: ToastMessage;
  onDone: (id: number) => void;
}

const TOAST_COLORS = {
  success: '#1DB954',
  error: '#E5383B',
  info: '#6CB4EE',
};

function ToastItem({ message, onDone }: ToastItemProps) {
  const translateY = useRef(new Animated.Value(-80)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        tension: 70,
        friction: 11,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start();

    // Error toasts stay longer so user can read them
    const dismissDelay = message.type === 'error' ? 5000 : 3000;

    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: -80,
          duration: 280,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 280,
          useNativeDriver: true,
        }),
      ]).start(() => onDone(message.id));
    }, dismissDelay);

    return () => clearTimeout(timer);
  }, [translateY, opacity, message.id, onDone]);

  const bgColor = TOAST_COLORS[message.type] || TOAST_COLORS.info;

  return (
    <Animated.View
      style={[
        styles.toast,
        { backgroundColor: bgColor, transform: [{ translateY }], opacity },
      ]}
    >
      <Text style={styles.toastText}>{message.text}</Text>
    </Animated.View>
  );
}

export default function ToastProvider() {
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<ToastMessage[]>([]);

  const handleMessage = useCallback((msg: ToastMessage) => {
    setMessages([msg]); // Max 1 toast visible at a time
  }, []);

  useEffect(() => {
    listeners.add(handleMessage);
    return () => {
      listeners.delete(handleMessage);
    };
  }, [handleMessage]);

  const handleDone = useCallback((id: number) => {
    setMessages((prev) => prev.filter((m) => m.id !== id));
  }, []);

  return (
    <View style={[styles.container, { top: insets.top + 8 }]} pointerEvents="none">
      {messages.map((msg) => (
        <ToastItem key={msg.id} message={msg} onDone={handleDone} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 9999,
    alignItems: 'center',
  },
  toast: {
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 14,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 8,
    ...Platform.select({
      ios: {},
      android: {},
      default: {},
    }),
  },
  toastText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    letterSpacing: -0.1,
  },
});
