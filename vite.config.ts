import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative base so the build works on GitHub Pages under /chalkvault/ and on Firebase Hosting.
export default defineConfig({
  base: './',
  plugins: [react()],
  // Polling avoids EBUSY watcher crashes on Windows when other tools lock files.
  server: { port: 5178, watch: { usePolling: true, interval: 400, ignored: ['**/.git/**', '**/dist/**'] } },
});
