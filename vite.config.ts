import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// @ts-expect-error local middleware module
import { webToPdfPlugin } from './server/web-to-pdf.mjs';

export default defineConfig({
  base: './',
  plugins: [react(), webToPdfPlugin()],
  server: {
    host: true,
    port: 5173,
    strictPort: true
  },
  preview: {
    host: true,
    port: 5173,
    strictPort: true
  },
  worker: {
    format: 'es'
  }
});
