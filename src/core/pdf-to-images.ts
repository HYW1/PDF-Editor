import { downloadBytes } from './files';
import { renderPageToCanvas } from './pdf-render';
import { zipStore } from './zip-store';
import type { Annotation, LoadedDoc, PageInfo } from './types';

async function canvasToPng(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('导出图片失败'));
          return;
        }
        blob.arrayBuffer().then((buf) => resolve(new Uint8Array(buf))).catch(reject);
      },
      'image/png'
    );
  });
}

async function drawAnnotations(
  canvas: HTMLCanvasElement,
  annotations: Annotation[]
): Promise<void> {
  if (!annotations.length) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const width = canvas.width;
  const height = canvas.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  for (const item of annotations) {
    const x = item.x * width;
    const y = item.y * height;
    const w = Math.max(1, item.width * width);
    const h = Math.max(1, item.height * height);
    if (item.type === 'text') {
      ctx.fillStyle = item.color || '#111111';
      ctx.font = `${Math.max(12, (item.fontSize || 18) * (width / 400))}px sans-serif`;
      ctx.textBaseline = 'top';
      ctx.fillText(item.content, x, y, w);
    } else {
      const image = new Image();
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error('签名图无法导出'));
        image.src = item.content;
      });
      ctx.drawImage(image, x, y, w, h);
    }
  }
}

export async function renderPagesToPngs(
  pages: PageInfo[],
  docs: Record<string, LoadedDoc>,
  annotations: Annotation[] = [],
  onProgress?: (done: number, total: number) => void
): Promise<{ name: string; data: Uint8Array }[]> {
  const out: { name: string; data: Uint8Array }[] = [];
  for (let index = 0; index < pages.length; index += 1) {
    onProgress?.(index + 1, pages.length);
    const page = pages[index];
    const canvas = document.createElement('canvas');
    await renderPageToCanvas(canvas, page, docs, 1400);
    const pageAnns = annotations.filter((item) => item.pageId === page.id);
    await drawAnnotations(canvas, pageAnns);
    const data = await canvasToPng(canvas);
    canvas.width = 0;
    canvas.height = 0;
    out.push({ name: `第${index + 1}页.png`, data });
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  }
  return out;
}

export function downloadPageImages(
  files: { name: string; data: Uint8Array }[],
  baseName: string
): void {
  const stem = baseName.replace(/\.(pdf|zip)$/i, '') || '页面';
  if (files.length === 1) {
    downloadBytes(files[0].data, `${stem}.png`, 'image/png');
    return;
  }
  downloadBytes(zipStore(files), `${stem}_图片.zip`, 'application/zip');
}
