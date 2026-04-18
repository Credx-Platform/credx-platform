import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 4173,
    host: true
  },
  base: '/',
  build: {
    rollupOptions: {
      input: {
        adminportal: resolve(__dirname, 'adminportal.html'),
        portal: resolve(__dirname, 'portal.html')
      }
    }
  }
});
