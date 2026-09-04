import { createWebToPdfHandler } from '../server/web-to-pdf-handler.mjs';
import { renderUrlToPdf } from '../server/render-url-puppeteer.mjs';

export const config = {
  maxDuration: 60,
  memory: 1024
};

export default createWebToPdfHandler(renderUrlToPdf);
