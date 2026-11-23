import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// VITE_BASE is '/chalkvault/' for GitHub Pages builds and '/' locally or on Firebase Hosting.
export default defineConfig({
  base: process.env.VITE_BASE || '/',
  plugins: [react()],
  // Polling avoids EBUSY watcher crashes on Windows when other tools lock files.
  server: { port: 5178, watch: { usePolling: true, interval: 400, ignored: ['**/.git/**', '**/dist/**'] } },
});
