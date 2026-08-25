import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    exclude: ['**/node_modules/**', '**/dist/**', '**/playwright/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        '**/node_modules/**',
        '**/dist/**',
        '**/__tests__/**',
        '**/*.spec.ts',
        '**/*.test.ts',
        'vite.config.ts',
        'vitest.config.ts',
        'playwright.config.ts',
      ],
    },
  },
  define: {
    'import.meta.env.VITE_GEMINI_API_KEY': JSON.stringify('test-api-key-for-vitest'),
    'import.meta.env.VITE_FIREBASE_API_KEY': JSON.stringify('test-firebase-key'),
    'import.meta.env.VITE_FIREBASE_PROJECT_ID': JSON.stringify('test-project'),
    'import.meta.env.VITE_FIREBASE_AUTH_DOMAIN': JSON.stringify('test.firebaseapp.com'),
    'import.meta.env.VITE_FIREBASE_STORAGE_BUCKET': JSON.stringify('test.appspot.com'),
    'import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID': JSON.stringify('123456'),
    'import.meta.env.VITE_FIREBASE_APP_ID': JSON.stringify('test-app-id'),
    'import.meta.env.MODE': JSON.stringify('test'),
    'import.meta.env.DEV': JSON.stringify(false),
    'import.meta.env.PROD': JSON.stringify(false),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './client'),
      '@shared': path.resolve(__dirname, './shared'),
    },
  },
});
