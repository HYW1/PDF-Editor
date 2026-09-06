import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import { loadCjkFontBytes } from './cjk-font.mjs';
import {
  finishOpenPage,
  headersForUrl,
  openAnyPublicPage,
  stealthScript,
  userAgentForUrl,
  viewportForUrl
} from './open-web-page.mjs';
import { printOpenedPage } from './prepare-web-pdf.mjs';

chromium.setGraphicsMode = false;

let browserPromise = null;

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
    await loadCjkFontBytes().catch((error) => console.warn('cjk font skipped', error));
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
    const extracted = (await openAnyPublicPage(page, targetUrl, onProgress)) || {};
    const opened = await finishOpenPage(page, targetUrl, onProgress, extracted);
    return await printOpenedPage(page, opened, onProgress, async () => {
      try {
        return await browser.newPage();
      } catch {
        browserPromise = null;
        const next = await getBrowser();
        return next.newPage();
      }
    });
  } catch (error) {
    if (/Target closed|Session closed|detached|crashed/i.test(String(error?.message || error))) {
      browserPromise = null;
    }
    throw error;
  } finally {
    await page.close().catch(() => {});
  }
}
