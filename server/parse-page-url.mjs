function extractCandidate(raw) {
  const text = String(raw || '').trim();
  if (!text) return '';
  const http = text.match(/https?:\/\/[^\s<>"'，。；、【】（）()]+/i);
  if (http) return http[0].replace(/[.,;:!?）)】》]+$/g, '');
  const first = text.split(/\s+/)[0];
  if (/^weixin:\/\//i.test(first) || /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(first)) return first;
  const bare = text.match(/\b((?:[\w-]+\.)+[a-z]{2,}(?:\/[^\s<>"']*)?)/i);
  if (bare) return bare[1].replace(/[.,;:!?）)】》]+$/g, '');
  return first;
}

export function parsePageUrl(raw, { allowPrivate = false } = {}) {
  const trimmed = extractCandidate(raw);
  if (!trimmed) return { error: '请输入网址' };
  if (/^weixin:\/\//i.test(trimmed)) {
    return { error: '请用微信里「复制链接」得到的 https 网址' };
  }
  let parsed;
  try {
    parsed = new URL(/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    return { error: '网址格式不对' };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { error: '只支持 http 或 https 网址' };
  }
  if (!allowPrivate && isPrivateHost(parsed.hostname)) {
    return { error: '不能转换内网地址' };
  }
  return { href: parsed.href, host: parsed.hostname || 'webpage' };
}

export function isPrivateHost(hostname) {
  const host = String(hostname || '')
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '');
  if (!host) return true;
  if (host === 'localhost' || host === '::1' || host === '0.0.0.0' || host.endsWith('.local')) return true;
  if (host === 'metadata.google.internal') return true;
  if (/^127\.\d+\.\d+\.\d+$/.test(host)) return true;
  if (/^10\.\d+\.\d+\.\d+$/.test(host)) return true;
  if (/^192\.168\.\d+\.\d+$/.test(host)) return true;
  if (/^169\.254\.\d+\.\d+$/.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+$/.test(host)) return true;
  return false;
}

export function isWechatHost(hostname) {
  const host = String(hostname || '').toLowerCase();
  return (
    host === 'mp.weixin.qq.com' ||
    host.endsWith('.weixin.qq.com') ||
    host === 'weixin.qq.com' ||
    host.endsWith('.wechat.com')
  );
}

export function pdfNameFromTitle(title, host) {
  const base = String(title || '')
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40);
  if (base && !/^(微信|weixin|腾讯|login|sign in|untitled)/i.test(base)) return `${base}.pdf`;
  return `${String(host || 'webpage').replace(/[^\w.-]+/g, '_')}.pdf`;
}
