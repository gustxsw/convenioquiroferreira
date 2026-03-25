import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  // Removes ALL console/debugger statements from the production bundle.
  // This is a hard safety net to prevent sensitive data from appearing in DevTools.
  esbuild: mode === 'production' ? { drop: ['console', 'debugger'] } : undefined,
}));
