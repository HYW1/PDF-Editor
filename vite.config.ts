import { defineConfig, type PluginOption } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(async ({ command }) => {
  const plugins: PluginOption[] = [react()];
  if (command !== 'build') {
    const { webToPdfPlugin } = await import('./server/web-to-pdf.mjs');
    plugins.push(webToPdfPlugin());
  }
  return {
    base: './',
    plugins,
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
  };
});
