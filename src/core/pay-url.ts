import jsQR from 'jsqr';
import { TIP_CODES, type TipPayMethod } from './tips';

const qrCache = new Map<string, string | null>();

export function toPayLaunchUrl(raw: string, method: TipPayMethod): string {
  const value = raw.trim();
  if (!value) return '';
  if (method === 'alipay') {
    if (/^alipays?:\/\//i.test(value)) return value;
    if (/^https?:\/\//i.test(value)) {
      return `alipays://platformapi/startapp?saId=10000007&qrcode=${encodeURIComponent(value)}`;
    }
  }
  return value;
}

export function isAppPayUrl(url: string): boolean {
  return /^(weixin|wxp|alipays?|alipay):/i.test(url);
}

export async function readPayUrl(method: TipPayMethod): Promise<string | null> {
  const configured = TIP_CODES[method].payUrl.trim();
  if (configured) return toPayLaunchUrl(configured, method);
  const src = TIP_CODES[method].src;
  if (qrCache.has(src)) {
    const cached = qrCache.get(src);
    return cached ? toPayLaunchUrl(cached, method) : null;
  }
  try {
    const decoded = await decodeQr(src);
    qrCache.set(src, decoded);
    return decoded ? toPayLaunchUrl(decoded, method) : null;
  } catch {
    qrCache.set(src, null);
    return null;
  }
}

async function decodeQr(src: string): Promise<string | null> {
  const image = await loadImage(src);
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(image, 0, 0);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const code = jsQR(pixels.data, pixels.width, pixels.height);
  return code?.data?.trim() || null;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('no qr'));
    image.src = src;
  });
}
