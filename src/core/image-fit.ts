import type { FitMode } from './types';

export interface DrawRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function fitImage(
  imageW: number,
  imageH: number,
  pageW: number,
  pageH: number,
  mode: FitMode
): DrawRect {
  if (mode === 'original') {
    return {
      x: (pageW - imageW) / 2,
      y: (pageH - imageH) / 2,
      width: imageW,
      height: imageH
    };
  }

  const scaleX = pageW / imageW;
  const scaleY = pageH / imageH;
  const scale = mode === 'cover' ? Math.max(scaleX, scaleY) : Math.min(scaleX, scaleY);
  const width = imageW * scale;
  const height = imageH * scale;

  return {
    x: (pageW - width) / 2,
    y: (pageH - height) / 2,
    width,
    height
  };
}
