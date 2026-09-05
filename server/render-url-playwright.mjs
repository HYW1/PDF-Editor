import { chromium } from 'playwright';
import {
  WEB_PDF_VIEWPORT,
  measureWebPageSize,
  pdfOptionsForWebPage,
  prepareWebPageForPdf
} from './prepare-web-pdf.mjs';

let browserPromise = null;

async function getBrowser() {
  if (!browserPromise) {
    browserPromise = chromium
      .launch({ channel: 'chrome', headless: true })
      .catch(() => chromium.launch({ headless: true }));
  }
  try {
    const browser = await browserPromise;
    if (!browser.isConnected()) throw new Error('closed');
    return browser;
  } catch {
    browserPromise = chromium
      .launch({ channel: 'chrome', headless: true })
      .catch(() => chromium.launch({ headless: true }));
    return browserPromise;
  }
}

export async function renderUrlToPdf(targetUrl, onProgress) {
  onProgress?.(12, '正在启动浏览器');
  const browser = await getBrowser();
  onProgress?.(22, '正在打开网页');
  const page = await browser.newPage({
    viewport: { width: WEB_PDF_VIEWPORT.width, height: WEB_PDF_VIEWPORT.height },
    locale: 'zh-CN'
  });
  try {
    let loaded = false;
    page.on('load', () => {
      loaded = true;
      onProgress?.(58, '网页已打开');
    });
    onProgress?.(32, '正在打开网页');
    await page.emulateMedia({ media: 'screen' });
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 28000 });
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
    if (!loaded) onProgress?.(62, '网页已打开');
    onProgress?.(74, '正在整理页面');
    await prepareWebPageForPdf(page);
    onProgress?.(86, '正在生成 PDF');
    const size = await measureWebPageSize(page);
    const bytes = await page.pdf(pdfOptionsForWebPage(size));
    onProgress?.(96, '即将完成');
    return bytes;
  } finally {
    await page.close().catch(() => {});
  }
}
