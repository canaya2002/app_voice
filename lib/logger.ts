const isDev = __DEV__;

export const logger = {
  info: (message: string, data?: Record<string, unknown>) => {
    if (isDev) {
      console.log(`[INFO] ${message}`, data ?? '');
    }
  },
  warn: (message: string, data?: Record<string, unknown>) => {
    if (isDev) {
      console.warn(`[WARN] ${message}`, data ?? '');
    }
  },
  error: (message: string, error?: unknown) => {
    if (isDev) {
      console.error(`[ERROR] ${message}`, error ?? '');
    }
    // In production: send to crash reporting (Sentry, etc.)
  },
};
