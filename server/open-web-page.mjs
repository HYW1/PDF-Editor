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
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8'
  };
  try {
    if (isWechatHost(new URL(targetUrl).hostname)) {
      headers.Referer = 'https://mp.weixin.qq.com/';
    }
  } catch {
    /* ignore */
  }
  return headers;
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
      await page.waitForSelector(selector, { timeout: wechat ? 12000 : 6000 });
      break;
    } catch {
      /* try next */
    }
  }
  await new Promise((resolve) => setTimeout(resolve, wechat ? 900 : 350));
}

export async function inspectPageAccess(page) {
  return page.evaluate(() => {
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
      empty: text.trim().length < 30
    };
  });
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

export async function finishOpenPage(page, targetUrl, onProgress) {
  onProgress?.(68, '正在整理页面');
  await waitForPageContent(page, targetUrl);
  const info = await inspectPageAccess(page);
  throwIfBlocked(info);
  await revealSiteContent(page);
  await prepareWebPageForPdf(page);
  const again = await inspectPageAccess(page);
  throwIfBlocked(again);
  if (again.empty) throw userFacing('页面是空的，可能被网站拦下了');
  const size = await measureWebPageSize(page);
  return {
    size,
    name: pdfNameFromTitle(again.title, new URL(targetUrl).hostname)
  };
}
