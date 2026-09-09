import * as pdfjs from 'pdfjs-dist';
import { PDFDocument } from 'pdf-lib';
import {
  COMPRESS_PRESETS,
  compressProfile,
  scaleForPage,
  type CompressQuality
} from './pdf-estimate';
import './pdf-render';

export type ExportQuality = 'original' | CompressQuality;

const GENTLE_RETRIES: Record<CompressQuality, ReadonlyArray<{ maxEdge: number; jpegQuality: number }>> = {
  high: [{ maxEdge: 2000, jpegQuality: 0.84 }],
  medium: [{ maxEdge: 1200, jpegQuality: 0.64 }],
  low: [{ maxEdge: 880, jpegQuality: 0.44 }]
};

export function qualityLabel(quality: ExportQuality): string {
  if (quality === 'original') return '原文件';
  return COMPRESS_PRESETS[quality].label;
}

export function compressSuffix(quality: Exclude<ExportQuality, 'original'>): string {
  return COMPRESS_PRESETS[quality].label.replace(/^适合/, '');
}

export async function compressPdfBytes(
  bytes: Uint8Array,
  quality: Exclude<ExportQuality, 'original'>,
  onProgress?: (done: number, total: number) => void
): Promise<Uint8Array> {
  const originalSize = bytes.byteLength;
  const data = new Uint8Array(bytes.byteLength);
  data.set(bytes);
  const pdf = await pdfjs.getDocument({ data }).promise;
  const profiles = [
    compressProfile(originalSize, pdf.numPages, quality),
    ...GENTLE_RETRIES[quality]
  ];

  try {
    for (const profile of profiles) {
      const next = await rasterizePdf(pdf, profile, onProgress);
      if (next.byteLength < originalSize) return next;
    }
    return bytes;
  } finally {
    await pdf.destroy().catch(() => undefined);
  }
}

async function rasterizePdf(
  pdf: pdfjs.PDFDocumentProxy,
  profile: { maxEdge: number; jpegQuality: number },
  onProgress?: (done: number, total: number) => void
): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  const total = pdf.numPages;

  for (let index = 1; index <= total; index += 1) {
    onProgress?.(index, total);
    const page = await pdf.getPage(index);
    const base = page.getViewport({ scale: 1 });
    const scale = scaleForPage(base.width, base.height, profile.maxEdge);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('无法压缩此页');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    const jpeg = await canvasToJpeg(canvas, profile.jpegQuality);
    canvas.width = 0;
    canvas.height = 0;
    const image = await out.embedJpg(jpeg);
    const dest = out.addPage([base.width, base.height]);
    dest.drawImage(image, { x: 0, y: 0, width: base.width, height: base.height });
    page.cleanup();
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
