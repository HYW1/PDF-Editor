import { parsePageUrl } from './parse-page-url.mjs';
import { renderUrlToPdf } from './render-url-playwright.mjs';
import { createWebToPdfHandler } from './web-to-pdf-handler.mjs';

export { parsePageUrl };

export function webToPdfPlugin() {
  const handle = createWebToPdfHandler(renderUrlToPdf);
  return {
    name: 'web-to-pdf',
    configureServer(server) {
      server.middlewares.use('/api/web-to-pdf', handle);
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/web-to-pdf', handle);
    }
  };
}
