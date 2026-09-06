import { chromium } from 'playwright';
import {
  finishOpenPage,
  headersForUrl,
  openAnyPublicPage,
  stealthScript,
  userAgentForUrl,
  viewportForUrl
} from './open-web-page.mjs';
import { printOpenedPage } from './prepare-web-pdf.mjs';

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
    await page.addInitScript(stealthScript);
    await page.emulateMedia({ media: 'screen' });
    const extracted = (await openAnyPublicPage(page, targetUrl, onProgress)) || {};
    const opened = await finishOpenPage(page, targetUrl, onProgress, extracted);
    return await printOpenedPage(page, opened, onProgress, () => browser.newPage());
  } finally {
    await page.close().catch(() => {});
  }
}
