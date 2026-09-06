import { isWechatHost } from './parse-page-url.mjs';

const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
const WECHAT_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.49(0x1800312a) NetType/WIFI Language/zh_CN';

function userAgentForUrl(targetUrl) {
  try {
    return isWechatHost(new URL(targetUrl).hostname) ? WECHAT_UA : DESKTOP_UA;
  } catch {
    return DESKTOP_UA;
  }
}

function headersForUrl(targetUrl) {
  const headers = {
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    Accept: '*/*'
  };
  try {
    const parsed = new URL(targetUrl);
    headers.Referer = isWechatHost(parsed.hostname) ? 'https://mp.weixin.qq.com/' : `${parsed.origin}/`;
  } catch {
    /* ignore */
  }
  return headers;
}

function isNoiseUrl(url) {
  return /google-analytics|googletagmanager|googleadservices|doubleclick|googlesyndication|pagead2|facebook\.net|hm\.baidu|cnzz\.com|umeng/i.test(
    String(url || '')
  );
}

const MAX_STYLESHEETS = 8;
const MAX_IMAGES = 48;
const MAX_IMAGE_BYTES = 1_200_000;
const MAX_TOTAL_BYTES = 9_000_000;
const FETCH_MS = 8000;
const LAZY_ATTRS = ['data-src', 'data-original', 'data-lazy', 'data-url', 'data-img', 'data-lazy-src', 'data-lazyload'];

export function decodeHtmlUrl(value) {
  return String(value || '')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

export function isPlaceholderUrl(url) {
  return /placeholder|bg-placeholder|lazy[-_]?load|spacer\.(gif|png)|blank\.(gif|png|jpe?g)|1x1\.(gif|png)|pixel\.(gif|png)|transparent\.(gif|png)|default[-_]?(img|image)|nopic|loading[-_]?(gif|png|svg)/i.test(
    String(url || '')
  );
}

function attrValue(tag, name) {
  const match = String(tag).match(new RegExp(`\\s${name}\\s*=\\s*["']([^"']+)["']`, 'i'));
  return match?.[1]?.trim() || '';
}

function firstSrcsetCandidate(value) {
  if (!value) return '';
  return String(value).split(',')[0].trim().split(/\s+/)[0] || '';
}

export function lazyImageUrlFromTag(tag) {
  for (const name of LAZY_ATTRS) {
    const value = attrValue(tag, name);
    if (value && !value.startsWith('data:')) return value;
  }
  return firstSrcsetCandidate(attrValue(tag, 'data-srcset') || attrValue(tag, 'srcset'));
}

function shouldPromoteSrc(src) {
  if (!src || src.startsWith('data:') || src.startsWith('about:blank')) return true;
  return isPlaceholderUrl(src);
}

export function promoteLazyImageHtml(html) {
  return String(html).replace(/<(?:img|source)\b[^>]*>/gi, (tag) => {
    const lazy = lazyImageUrlFromTag(tag);
    if (!lazy) return tag;
    const src = attrValue(tag, 'src');
    if (!shouldPromoteSrc(src)) return tag;
    if (/\ssrc\s*=/.test(tag)) {
      return tag.replace(/\ssrc\s*=\s*["'][^"']*["']/i, ` src="${lazy}"`);
    }
    return tag.replace(/^<(img|source)\b/i, `<$1 src="${lazy}"`);
  });
}

function imageScore(url) {
  const u = String(url || '').toLowerCase();
  if (isPlaceholderUrl(u)) return -100;
  if (/img\.zcool\.cn\/community/.test(u)) return 100;
  if (/wp-content\/uploads/.test(u)) return 90;
  if (/banner|wp-image|uploads\/20\d{2}|article|content/.test(u)) return 80;
  if (/avatar|icon|logo|emoji|favicon|sprite/.test(u)) return 5;
  if (/\.(jpe?g|png|webp)(\?|$)/i.test(u)) return 60;
  return 20;
}

function replaceUrlInHtml(html, url, data) {
  const decoded = decodeHtmlUrl(url);
  const encoded = decoded.replace(/&/g, '&amp;');
  let next = html;
  for (const form of [url, decoded, encoded]) {
    if (form && next.includes(form)) next = next.split(form).join(data);
  }
  const relative = decoded.replace(/^https?:\/\/[^/]+/i, '');
  if (relative && relative !== decoded && next.includes(relative)) {
    next = next.split(relative).join(data);
  }
  const relativeEncoded = encoded.replace(/^https?:\/\/[^/]+/i, '');
  if (relativeEncoded && relativeEncoded !== encoded && next.includes(relativeEncoded)) {
    next = next.split(relativeEncoded).join(data);
  }
  return next;
}

export function absolutizeUrl(url, baseUrl) {
  const raw = decodeHtmlUrl(url)
    .trim()
    .replace(/^url\(/i, '')
    .replace(/\)$/i, '')
    .trim()
    .replace(/^['"]|['"]$/g, '');
  if (!raw || raw.startsWith('data:') || raw.startsWith('blob:') || raw.startsWith('about:')) return raw;
  if (raw.startsWith('//')) return `https:${raw}`;
  try {
    return new URL(raw, baseUrl).href;
  } catch {
    return '';
  }
}

function guessMime(url, fallback = 'application/octet-stream') {
  if (/\.woff2(\?|$)/i.test(url)) return 'font/woff2';
  if (/\.woff(\?|$)/i.test(url)) return 'font/woff';
  if (/\.ttf(\?|$)/i.test(url)) return 'font/ttf';
  if (/\.otf(\?|$)/i.test(url)) return 'font/otf';
  if (/\.svg(\?|$)/i.test(url)) return 'image/svg+xml';
  if (/\.webp(\?|$)/i.test(url)) return 'image/webp';
  if (/\.png(\?|$)/i.test(url)) return 'image/png';
  if (/\.jpe?g(\?|$)/i.test(url)) return 'image/jpeg';
  if (/\.gif(\?|$)/i.test(url)) return 'image/gif';
  if (/\.css(\?|$)/i.test(url)) return 'text/css';
  return fallback;
}

async function fetchResource(url, baseUrl) {
  const abs = absolutizeUrl(url, baseUrl);
  if (!abs || abs.startsWith('data:') || isNoiseUrl(abs)) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_MS);
  try {
    const res = await fetch(abs, {
      redirect: 'follow',
      headers: {
        ...headersForUrl(abs),
        'User-Agent': userAgentForUrl(abs),
        Accept: '*/*'
      },
      signal: controller.signal
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length) return null;
    const type = (res.headers.get('content-type') || '').split(';')[0].trim() || guessMime(res.url || abs);
    return { url: res.url || abs, buf, type };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function toDataUri(resource, fallbackUrl = '') {
  const mime = resource.type || guessMime(resource.url || fallbackUrl);
  return `data:${mime};base64,${resource.buf.toString('base64')}`;
}

async function rewriteCssUrls(css, cssUrl, budget) {
  const matches = [...String(css).matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi)];
  let next = String(css);
  for (const match of matches.slice(0, 20)) {
    const raw = match[2];
    if (!raw || raw.startsWith('data:')) continue;
    if (budget.used >= MAX_TOTAL_BYTES) break;
    const resource = await fetchResource(raw, cssUrl);
    if (!resource || resource.buf.length > MAX_IMAGE_BYTES) continue;
    budget.used += resource.buf.length;
    next = next.split(match[0]).join(`url("${toDataUri(resource, raw)}")`);
  }
  return next;
}

export function stripNonContent(html) {
  return String(html)
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<(iframe|video|audio|object|embed)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<(iframe|video|audio|object|embed)[^>]*\/?>/gi, '');
}

export const PAGE_PRINT_CSS = `
html, body { height: auto !important; max-height: none !important; overflow: visible !important; }
header, .header, nav, .nav, .topbar, [class*="sticky"], [class*="fixed"] {
  position: relative !important;
  top: auto !important;
  bottom: auto !important;
}
* { animation: none !important; transition: none !important; }
img, video, canvas, svg { max-width: 100% !important; height: auto !important; }
@page { margin: 0; }
`;

export async function inlineWebPage(targetUrl, onProgress) {
  onProgress?.(36, '正在下载网页');
  const pageRes = await fetchResource(targetUrl, targetUrl);
  if (!pageRes) throw Object.assign(new Error('网站拒绝打开这个页面'), { expose: true });
  let html = pageRes.buf.toString('utf8');
  if (!html || html.length < 80) throw Object.assign(new Error('网页没有内容'), { expose: true });
  const finalUrl = pageRes.url || targetUrl;
  html = promoteLazyImageHtml(stripNonContent(html));

  const budget = { used: 0 };
  const sheets = [...html.matchAll(/<link\b[^>]*rel=["']stylesheet["'][^>]*>/gi)].slice(0, MAX_STYLESHEETS);
  for (const match of sheets) {
    const href = (match[0].match(/href=["']([^"']+)["']/i) || [])[1];
    if (!href) continue;
    const cssRes = await fetchResource(href, finalUrl);
    if (!cssRes) continue;
    const css = await rewriteCssUrls(cssRes.buf.toString('utf8'), cssRes.url, budget);
    html = html.replace(match[0], `<style data-pdf-helper="css">${css}</style>`);
  }

  const imageUrls = [];
  const pushUrl = (raw) => {
    const abs = absolutizeUrl(raw, finalUrl);
    if (!abs || abs.startsWith('data:') || isPlaceholderUrl(abs) || imageUrls.includes(abs)) return;
    imageUrls.push(abs);
  };
  for (const match of html.matchAll(/<(?:img|source)\b[^>]*>/gi)) {
    const tag = match[0];
    pushUrl(attrValue(tag, 'src'));
    pushUrl(lazyImageUrlFromTag(tag));
  }
  for (const match of html.matchAll(/background-image\s*:\s*url\((['"]?)([^'")]+)\1\)/gi)) {
    pushUrl(match[2]);
  }

  const ranked = [...imageUrls].sort((a, b) => imageScore(b) - imageScore(a));

  onProgress?.(44, '正在下载图片和样式');
  let inlined = 0;
  for (const url of ranked.slice(0, MAX_IMAGES)) {
    if (budget.used >= MAX_TOTAL_BYTES) break;
    const resource = await fetchResource(url, finalUrl);
    if (!resource || resource.buf.length > MAX_IMAGE_BYTES) continue;
    budget.used += resource.buf.length;
    html = replaceUrlInHtml(html, url, toDataUri(resource, url));
    inlined += 1;
  }

  const safeBase = finalUrl.replace(/"/g, '&quot;');
  if (!/<base\s/i.test(html)) {
    html = html.replace(/<head([^>]*)>/i, `<head$1><base href="${safeBase}">`);
  }
  html = html.replace(/<\/head>/i, `<style data-pdf-helper="print">${PAGE_PRINT_CSS}</style></head>`);
  return { html, finalUrl, title: (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '', inlined };
}
