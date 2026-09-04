import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';

chromium.setGraphicsMode = false;

let browserPromise = null;

async function ensureCjkFont() {
  const dest = '/tmp/fonts/NotoSansSC-Regular.otf';
  try {
    const { access, mkdir, writeFile } = await import('node:fs/promises');
    await mkdir('/tmp/fonts', { recursive: true });
    try {
      await access(dest);
      return;
    } catch {
      /* download below */
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(
      'https://cdn.jsdelivr.net/gh/googlefonts/noto-cjk@main/Sans/SubsetOTF/SC/NotoSansSC-Regular.otf',
      { signal: controller.signal }
    );
    clearTimeout(timer);
    if (!res.ok) return;
    await writeFile(dest, Buffer.from(await res.arrayBuffer()));
  } catch (error) {
    console.warn('cjk font skipped', error);
  }
}

async function getBrowser() {
  if (browserPromise) {
    try {
      const browser = await browserPromise;
      if (browser.connected) return browser;
    } catch {
      browserPromise = null;
    }
  }
  browserPromise = (async () => {
    await ensureCjkFont();
    const args = await puppeteer.defaultArgs({
      args: chromium.args,
      headless: 'shell'
    });
    return puppeteer.launch({
      args,
      defaultViewport: { width: 1280, height: 900, deviceScaleFactor: 1 },
      executablePath: await chromium.executablePath(),
      headless: 'shell'
    });
  })();
  return browserPromise;
}

export async function renderUrlToPdf(targetUrl, onProgress) {
  onProgress?.(12, '正在启动浏览器');
  const browser = await getBrowser();
  onProgress?.(22, '正在打开网页');
  const page = await browser.newPage();
  try {
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8' });
    page.on('load', () => onProgress?.(58, '网页已打开'));
    onProgress?.(32, '正在打开网页');
    await page.goto(targetUrl, { waitUntil: 'load', timeout: 25000 });
    onProgress?.(74, '正在整理页面');
    await new Promise((resolve) => setTimeout(resolve, 700));
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
