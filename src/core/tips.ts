export const TIP_AMOUNTS = [2, 3, 5, 6.6, 8.8, 16.8];

export const TIP_CODES = {
  wechat: {
    label: '微信',
    src: './tip/wechat.png',
    payUrl: '',
    hint: '把微信收款码截图存成 public/tip/wechat.png，刷新即可。'
  },
  alipay: {
    label: '支付宝',
    src: './tip/alipay.png',
    payUrl: '',
    hint: '把支付宝收款码截图存成 public/tip/alipay.png，刷新即可。'
  }
} as const;

export type TipPayMethod = keyof typeof TIP_CODES;

export function randomTipAmount(): string {
  return String(TIP_AMOUNTS[Math.floor(Math.random() * TIP_AMOUNTS.length)]);
}

export function formatTipAmount(raw: string): string {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return '';
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
}
