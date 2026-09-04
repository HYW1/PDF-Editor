import * as pdfjs from 'pdfjs-dist';
import { PDFDocument } from 'pdf-lib';
import './pdf-render';

export type ExportQuality = 'original' | 'high' | 'medium' | 'low';

const PRESETS = {
  high: { scale: 2, jpeg: 0.84 },
  medium: { scale: 1.35, jpeg: 0.62 },
  low: { scale: 1, jpeg: 0.4 }
} as const;

export function qualityLabel(quality: ExportQuality): string {
  if (quality === 'original') return '原画质';
  if (quality === 'high') return '高画质';
  if (quality === 'medium') return '中画质';
  return '低画质';
}

export async function compressPdfBytes(
  bytes: Uint8Array,
  quality: Exclude<ExportQuality, 'original'>,
  onProgress?: (done: number, total: number) => void
): Promise<Uint8Array> {
  const preset = PRESETS[quality];
  const data = new Uint8Array(bytes.byteLength);
  data.set(bytes);
  const pdf = await pdfjs.getDocument({ data }).promise;
  const out = await PDFDocument.create();
  const total = pdf.numPages;

  for (let index = 1; index <= total; index += 1) {
    onProgress?.(index, total);
    const page = await pdf.getPage(index);
    const base = page.getViewport({ scale: 1 });
    let scale = preset.scale;
    const maxEdge = 4096;
    if (base.width * scale > maxEdge || base.height * scale > maxEdge) {
      scale = maxEdge / Math.max(base.width, base.height);
    }
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('无法压缩此页');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    const jpeg = await canvasToJpeg(canvas, preset.jpeg);
    canvas.width = 0;
    canvas.height = 0;
    const image = await out.embedJpg(jpeg);
    const dest = out.addPage([base.width, base.height]);
    dest.drawImage(image, { x: 0, y: 0, width: base.width, height: base.height });
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  }

  return out.save({ useObjectStreams: true });
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('压缩失败'));
          return;
        }
        blob.arrayBuffer().then((buf) => resolve(new Uint8Array(buf))).catch(reject);
      },
      'image/jpeg',
      quality
    );
  });
}
