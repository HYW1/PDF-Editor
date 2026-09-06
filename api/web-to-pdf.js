import { createWebToPdfHandler } from '../server/web-to-pdf-handler.mjs';
import { renderUrlToPdf } from '../server/render-url-puppeteer.mjs';

export const config = {
  maxDuration: 120,
  memory: 2048
};

export default createWebToPdfHandler(renderUrlToPdf);
