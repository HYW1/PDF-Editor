import { isWechatHost, pdfNameFromTitle } from './parse-page-url.mjs';
import { measureWebPageSize, prepareWebPageForPdf, revealSiteContent } from './prepare-web-pdf.mjs';

export const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
export const WECHAT_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.49(0x1800312a) NetType/WIFI Language/zh_CN';

export function userAgentForUrl(targetUrl) {
  try {
    return isWechatHost(new URL(targetUrl).hostname) ? WECHAT_UA : DESKTOP_UA;
  } catch {
    return DESKTOP_UA;
  }
}

export function viewportForUrl(targetUrl) {
  try {
    if (isWechatHost(new URL(targetUrl).hostname)) {
      return { width: 430, height: 900, deviceScaleFactor: 2 };
    }
  } catch {
    /* desktop fallback */
  }
  return { width: 1280, height: 900, deviceScaleFactor: 1 };
}

export function headersForUrl(targetUrl) {
  const headers = {
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Upgrade-Insecure-Requests': '1',
    'Cache-Control': 'no-cache'
  };
  try {
    const parsed = new URL(targetUrl);
    headers.Referer = isWechatHost(parsed.hostname) ? 'https://mp.weixin.qq.com/' : `${parsed.origin}/`;
  } catch {
    /* ignore */
  }
  return headers;
}

export function isNoiseUrl(url) {
  return /google-analytics|googletagmanager|googleadservices|doubleclick|googlesyndication|pagead2|facebook\.net|connect\.facebook|hotjar|fullstory|clarity\.ms|baidu\.com\/hm|hm\.baidu|cnzz\.com|umeng|sensorsdata|adsystem|adservice|scorecardresearch|quantserve|ads-twitter|platform\.twitter|google.com\/recaptcha/i.test(
    String(url || '')
  );
}

export async function enableTrafficFilter(page) {
  if (typeof page.route !== 'function') return;
  await page.route('**/*', (route) => {
    if (isNoiseUrl(route.request().url())) return route.abort();
    return route.continue();
  });
}

async function pageHasUsableContent(page) {
  try {
    return await page.evaluate(
      () => Boolean(document.body && (document.body.innerText || '').replace(/\s+/g, '').length > 20)
    );
  } catch {
    return false;
  }
}

export async function navigatePublicPage(page, targetUrl, onProgress) {
  onProgress?.(32, '正在打开网页');
  let opened = false;
  const markOpen = () => {
    if (opened) return;
    opened = true;
    onProgress?.(58, '网页已打开');
  };
  page.on('domcontentloaded', markOpen);
  page.on('load', markOpen);

  try {
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 12000 });
    await page.waitForSelector('body', { timeout: 4000 }).catch(() => {});
    markOpen();
  } catch (error) {
    if (!(await pageHasUsableContent(page))) throw error;
    markOpen();
  }

  await new Promise((resolve) => setTimeout(resolve, 250));
}

export async function loadPageFromHtml(page, targetUrl, onProgress) {
  onProgress?.(36, '正在下载网页');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  let res;
  try {
    res = await fetch(targetUrl, {
      redirect: 'follow',
      headers: {
        ...headersForUrl(targetUrl),
        'User-Agent': userAgentForUrl(targetUrl)
      },
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw userFacing('网站拒绝打开这个页面');
  let html = await res.text();
  if (!html || html.length < 80) throw userFacing('网页没有内容');
  const extracted = textFromHtml(html);
  const finalUrl = res.url || targetUrl;
  html = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<(iframe|video|audio|object|embed)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<(iframe|video|audio|object|embed)[^>]*\/?>/gi, '');
  const safeBase = finalUrl.replace(/"/g, '&quot;');
  if (!/<base\s/i.test(html)) {
    html = html.replace(/<head([^>]*)>/i, `<head$1><base href="${safeBase}">`);
  }
  onProgress?.(50, '正在打开网页');
  await freezePageNetwork(page);
  const bootstrap = `data:text/html;charset=utf-8,${encodeURIComponent(
    `<!doctype html><html><head><meta charset="utf-8"><base href="${safeBase}"></head><body></body></html>`
  )}`;
  try {
    await page.goto(bootstrap, { waitUntil: 'domcontentloaded', timeout: 4000 });
  } catch {
    /* setContent still works even if this bootstrap navigation is skipped */
  }
  try {
    await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: process.env.VERCEL ? 8000 : 20000 });
  } catch {
    /* HTML is already in the page even if stylesheets or images hang. */
  }
  onProgress?.(58, '网页已打开');
  return extracted;
}

export function textFromHtml(html) {
  const raw = String(html);
  const rawTitle = (raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '';
  const main = raw.match(/<article\b[\s\S]*?<\/article>/i)?.[0] || raw.match(/<main\b[\s\S]*?<\/main>/i)?.[0] || raw;
  const text = decodeHtml(
    main
      .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<[^>]+>/g, '\n')
  )
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { title: decodeHtml(rawTitle).replace(/\s+/g, ' ').trim(), text };
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

export async function freezePageNetwork(page) {
  if (page._pdfHelperFrozen) return;
  page._pdfHelperFrozen = true;
  if (typeof page.setRequestInterception === 'function') {
    try {
      await page.setRequestInterception(true);
      page.on('request', (req) => {
        const url = String(req.url() || '');
        if (url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('about:')) {
          return req.continue();
        }
        return req.abort().catch(() => {});
      });
    } catch (error) {
      console.warn('freeze network', error);
    }
  }
}

export async function openAnyPublicPage(page, targetUrl, onProgress) {
  if (process.env.VERCEL) {
    try {
      return await loadPageFromHtml(page, targetUrl, onProgress);
    } catch (error) {
      console.warn('fetch html failed, trying browser', error);
    }
  }
  try {
    await navigatePublicPage(page, targetUrl, onProgress);
    if (await pageHasUsableContent(page)) return { title: '', text: '' };
  } catch (error) {
    console.warn('goto failed', error);
  }
  if (!process.env.VERCEL) {
    return await loadPageFromHtml(page, targetUrl, onProgress);
  }
  throw userFacing('打不开这个网页');
}

export function stealthScript() {
  Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  window.chrome = window.chrome || { runtime: {} };
  Object.defineProperty(navigator, 'languages', { get: () => ['zh-CN', 'zh', 'en'] });
  if (!window.WeixinJSBridge) {
    window.WeixinJSBridge = {
      on() {},
      invoke(_name, _data, cb) {
        cb?.({ err_msg: 'ok' });
      }
    };
    document.addEventListener('DOMContentLoaded', () => {
      document.dispatchEvent(new Event('WeixinJSBridgeReady'));
    });
  }
}

function userFacing(message) {
  const error = new Error(message);
  error.expose = true;
  return error;
}

export async function waitForPageContent(page, targetUrl) {
  let wechat = false;
  try {
    wechat = isWechatHost(new URL(targetUrl).hostname);
  } catch {
    /* ignore */
  }
  const selectors = wechat
    ? ['#js_content', '#activity-name', '#img-content', '.rich_media_content']
    : ['article', 'main', '#content', '#root', '#app', 'body'];
  for (const selector of selectors) {
    try {
      await page.waitForSelector(selector, { timeout: wechat ? 8000 : 2500 });
      break;
    } catch {
      /* try next */
    }
  }
  await new Promise((resolve) => setTimeout(resolve, wechat ? 900 : 350));
}

export async function inspectPageAccess(page) {
  try {
    return await page.evaluate(() => {
      const text = (document.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 5000);
      const href = location.href;
      const title = document.title || '';
      const loginUrl = /\/(login|signin|passport|accounts\/|account\/login)\b/i.test(href);
      const loginForm = Boolean(document.querySelector('input[type=password]')) && /登录|sign in|log in/i.test(text);
      const login = loginUrl || loginForm;
      const captcha = /wappoc_appmsgcaptcha|请输入验证码|环境异常|完成验证|安全验证|unusual traffic/i.test(
        `${href} ${text}`
      );
      const wechatBlocked =
        /请在微信打开|该内容被投诉|此内容发送给朋友才可查看|由作者设置.*不能查看|违规无法查看|该内容已被发布者删除/.test(
          text
        );
      return {
        href,
        title,
        login,
        captcha,
        wechatBlocked,
        empty: text.trim().length < 30 && (document.body?.innerHTML || '').length < 800
      };
    });
  } catch {
    return { href: '', title: '', login: false, captcha: false, wechatBlocked: false, empty: false };
  }
}

export function throwIfBlocked(info) {
  if (info.wechatBlocked) {
    throw userFacing('这篇微信内容不公开，转不了');
  }
  if (info.captcha) {
    throw userFacing('网站加了验证，请用微信里「复制链接」的短网址再试');
  }
  if (info.login) {
    throw userFacing('这个页面要登录，公开页面才能转');
  }
}

export async function snapshotPageText(page) {
  try {
    return await page.evaluate(() => ({
      title: document.title || '',
      text: (document.body?.innerText || document.body?.textContent || '')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
        .slice(0, 200000)
    }));
  } catch {
    return { title: '', text: '' };
  }
}

export async function finishOpenPage(page, targetUrl, onProgress, extracted = {}) {
  onProgress?.(68, '正在整理页面');
  await waitForPageContent(page, targetUrl).catch(() => {});
  const info = await inspectPageAccess(page);
  throwIfBlocked(info);
  const snap = await snapshotPageText(page);
  if (!process.env.VERCEL) {
    await revealSiteContent(page).catch(() => {});
    await prepareWebPageForPdf(page).catch(() => {});
  }
  const again = await inspectPageAccess(page);
  throwIfBlocked(again);
  if (again.empty && !process.env.VERCEL) throw userFacing('页面是空的，可能被网站拦下了');
  let size = { width: 1280, height: 900 };
  try {
    size = await measureWebPageSize(page);
  } catch {
    /* keep a printable default size */
  }
  const title = again.title || snap.title || extracted.title || '';
  const text = (snap.text || '').length >= (extracted.text || '').length ? snap.text : extracted.text;
  return {
    size,
    title,
    text: text || extracted.text || '',
    name: pdfNameFromTitle(title, new URL(targetUrl).hostname)
  };
}
