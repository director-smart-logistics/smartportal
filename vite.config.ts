import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist/spa",
    rollupOptions: {
      output: {
        manualChunks: {
          // Core React runtime - changes rarely
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          
          // Data fetching & state management
          'vendor-data': ['@tanstack/react-query', 'zustand'],
          
          // UI Framework - Radix components
          'vendor-radix': [
            '@radix-ui/react-dialog',
            '@radix-ui/react-dropdown-menu',
            '@radix-ui/react-select',
            '@radix-ui/react-tabs',
            '@radix-ui/react-tooltip',
            '@radix-ui/react-popover',
            '@radix-ui/react-checkbox',
            '@radix-ui/react-switch',
            '@radix-ui/react-scroll-area',
            '@radix-ui/react-toast',
            '@radix-ui/react-label',
            '@radix-ui/react-slot',
          ],
          
          // Charts - only loaded when needed
          'vendor-charts': ['recharts'],
          
          // Tables & virtualization
          'vendor-tables': ['@tanstack/react-table', '@tanstack/react-virtual'],
          
          // Animation library
          'vendor-motion': ['framer-motion'],
          
          // Form handling
          'vendor-forms': ['react-hook-form', '@hookform/resolvers', 'zod'],
          
          // Date utilities
          'vendor-dates': ['date-fns', 'react-day-picker'],
          
          // i18n
          'vendor-i18n': ['i18next', 'react-i18next'],
          
          // File processing (heavy, lazy load candidates)
          'vendor-files': ['xlsx', 'papaparse'],

          // Firebase SDKs - large footprint
          'vendor-firebase': [
            'firebase/app',
            'firebase/auth',
            'firebase/firestore',
            'firebase/storage',
            'firebase/analytics',
            'firebase/performance',
            'firebase/messaging'
          ],

          // Lucide Icons
          'vendor-icons': ['lucide-react'],
        },
      },
    },
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./client"),
      "@shared": path.resolve(__dirname, "./shared"),
    },
  },
}))
