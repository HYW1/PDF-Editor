import { chromium } from 'playwright';

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
    viewport: { width: 1280, height: 900 },
    locale: 'zh-CN'
  });
  try {
    let loaded = false;
    page.on('load', () => {
      loaded = true;
      onProgress?.(58, '网页已打开');
    });
    onProgress?.(32, '正在打开网页');
    await page.goto(targetUrl, { waitUntil: 'load', timeout: 25000 });
    if (!loaded) onProgress?.(62, '网页已打开');
    onProgress?.(74, '正在整理页面');
    await page.waitForTimeout(700);
    onProgress?.(86, '正在生成 PDF');
    const bytes = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '12mm', right: '12mm', bottom: '12mm', left: '12mm' }
    });
    onProgress?.(96, '即将完成');
    return bytes;
  } finally {
    await page.close().catch(() => {});
  }
}
