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
        portal: resolve(__dirname, 'portal.html'),
        start: resolve(__dirname, 'start.html'),
        team: resolve(__dirname, 'team.html')
      },
      output: {
        // Keep the heavy PDF stack in its own lazy chunks (loaded only when a
        // client downloads a dispute-letter PDF), each well under the warning
        // threshold, instead of a single ~985 kB html2pdf bundle.
        manualChunks(id) {
          if (id.includes('node_modules/jspdf')) return 'vendor-jspdf';
          if (id.includes('node_modules/html2canvas')) return 'vendor-html2canvas';
          if (id.includes('node_modules/dompurify')) return 'vendor-dompurify';
          return undefined;
        }
      }
    }
  }
});
