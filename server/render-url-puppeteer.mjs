import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import {
  finishOpenPage,
  headersForUrl,
  stealthScript,
  userAgentForUrl,
  viewportForUrl
} from './open-web-page.mjs';
import { pdfOptionsForWebPage } from './prepare-web-pdf.mjs';

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
      args: [...chromium.args, '--disable-blink-features=AutomationControlled'],
      headless: 'shell'
    });
    return puppeteer.launch({
      args,
      defaultViewport: viewportForUrl('https://example.com'),
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
    await page.setUserAgent(userAgentForUrl(targetUrl));
    await page.setViewport(viewportForUrl(targetUrl));
    await page.setExtraHTTPHeaders(headersForUrl(targetUrl));
    await page.evaluateOnNewDocument(stealthScript);
    await page.emulateMediaType('screen');
    page.on('load', () => onProgress?.(58, '网页已打开'));
    onProgress?.(32, '正在打开网页');
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 40000 });
    await page.waitForNetworkIdle({ idleTime: 500, timeout: 8000 }).catch(() => {});
    const { size, name } = await finishOpenPage(page, targetUrl, onProgress);
    onProgress?.(86, '正在生成 PDF');
    const bytes = await page.pdf(pdfOptionsForWebPage(size));
    onProgress?.(96, '即将完成');
    return { bytes, name };
  } finally {
    await page.close().catch(() => {});
  }
}
