export function parsePageUrl(raw, { allowPrivate = false } = {}) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return { error: '请输入网址' };
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
