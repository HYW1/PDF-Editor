import { chromium } from 'playwright';
import {
  finishOpenPage,
  headersForUrl,
  stealthScript,
  userAgentForUrl,
  viewportForUrl
} from './open-web-page.mjs';
import { pdfOptionsForWebPage } from './prepare-web-pdf.mjs';

let browserPromise = null;

async function getBrowser() {
  if (!browserPromise) {
    browserPromise = chromium
      .launch({ channel: 'chrome', headless: true, args: ['--disable-blink-features=AutomationControlled'] })
      .catch(() => chromium.launch({ headless: true }));
  }
  try {
    const browser = await browserPromise;
    if (!browser.isConnected()) throw new Error('closed');
    return browser;
  } catch {
    browserPromise = chromium
      .launch({ channel: 'chrome', headless: true, args: ['--disable-blink-features=AutomationControlled'] })
      .catch(() => chromium.launch({ headless: true }));
    return browserPromise;
  }
}

export async function renderUrlToPdf(targetUrl, onProgress) {
  onProgress?.(12, '正在启动浏览器');
  const browser = await getBrowser();
  onProgress?.(22, '正在打开网页');
  const viewport = viewportForUrl(targetUrl);
  const page = await browser.newPage({
    viewport: { width: viewport.width, height: viewport.height },
    userAgent: userAgentForUrl(targetUrl),
    locale: 'zh-CN',
    extraHTTPHeaders: headersForUrl(targetUrl)
  });
  try {
    let loaded = false;
    page.on('load', () => {
      loaded = true;
      onProgress?.(58, '网页已打开');
    });
    onProgress?.(32, '正在打开网页');
    await page.addInitScript(stealthScript);
    await page.emulateMedia({ media: 'screen' });
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 40000 });
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
    if (!loaded) onProgress?.(62, '网页已打开');
    const { size, name } = await finishOpenPage(page, targetUrl, onProgress);
    onProgress?.(86, '正在生成 PDF');
    const bytes = await page.pdf(pdfOptionsForWebPage(size));
    onProgress?.(96, '即将完成');
    return { bytes, name };
  } finally {
    await page.close().catch(() => {});
  }
}
