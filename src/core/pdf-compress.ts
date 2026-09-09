import * as pdfjs from 'pdfjs-dist';
import { PDFDocument } from 'pdf-lib';
import {
  COMPRESS_PRESETS,
  compressProfile,
  estimateFromSamples,
  scaleForPage,
  type CompressQuality
} from './pdf-estimate';
import { getPdfJsDoc } from './pdf-render';
import type { LoadedDoc, PageInfo } from './types';

export type ExportQuality = 'original' | CompressQuality;

const GENTLE_RETRIES: Record<CompressQuality, ReadonlyArray<{ maxEdge: number; jpegQuality: number }>> = {
  high: [],
  medium: [{ maxEdge: 1600, jpegQuality: 0.76 }],
  low: [{ maxEdge: 1000, jpegQuality: 0.56 }]
};

export function qualityLabel(quality: ExportQuality): string {
  if (quality === 'original') return '原文件';
  return COMPRESS_PRESETS[quality].label;
}

export function compressSuffix(quality: Exclude<ExportQuality, 'original'>): string {
  return COMPRESS_PRESETS[quality].label;
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

export function samplePageIndexes(pageCount: number): number[] {
  if (pageCount <= 1) return [0];
  if (pageCount === 2) return [0, 1];
  return [0, Math.floor((pageCount - 1) / 2)];
}

export async function probeCompressSizes(
  pages: PageInfo[],
  docs: Record<string, LoadedDoc>,
  originalBytes: number
): Promise<{ high: number; medium: number; low: number }> {
  const indexes = samplePageIndexes(pages.length);
  const highSamples: number[] = [];
  const mediumSamples: number[] = [];
  const lowSamples: number[] = [];

  for (const index of indexes) {
    const page = pages[index];
    if (!page) continue;
    const measured = await measurePageQualityJpegs(page, docs);
    if (!measured) continue;
    highSamples.push(measured.high);
    mediumSamples.push(measured.medium);
    lowSamples.push(measured.low);
  }

    const high = estimateFromSamples(highSamples, pages.length, originalBytes);
    const medium = Math.min(
      high || Infinity,
      estimateFromSamples(mediumSamples, pages.length, originalBytes)
    );
    const low = Math.min(
      medium || Infinity,
      estimateFromSamples(lowSamples, pages.length, originalBytes)
    );
    if (!high) throw new Error('probe empty');
    return { high, medium: medium || high, low: low || medium || high };
}

async function measurePageQualityJpegs(
  page: PageInfo,
  docs: Record<string, LoadedDoc>
): Promise<{ high: number; medium: number; low: number } | null> {
  const highCanvas = await renderPageForCompress(page, docs, COMPRESS_PRESETS.high.maxEdge);
  if (!highCanvas) return null;
  const high = (await canvasToJpeg(highCanvas, COMPRESS_PRESETS.high.jpeg)).byteLength;
  const mediumCanvas = scaleCanvasToMaxEdge(highCanvas, COMPRESS_PRESETS.medium.maxEdge);
  const medium = (await canvasToJpeg(mediumCanvas, COMPRESS_PRESETS.medium.jpeg)).byteLength;
  const lowCanvas = scaleCanvasToMaxEdge(highCanvas, COMPRESS_PRESETS.low.maxEdge);
  const low = (await canvasToJpeg(lowCanvas, COMPRESS_PRESETS.low.jpeg)).byteLength;
  highCanvas.width = 0;
  highCanvas.height = 0;
  mediumCanvas.width = 0;
  mediumCanvas.height = 0;
  lowCanvas.width = 0;
  lowCanvas.height = 0;
  return { high, medium, low };
}

async function renderPageForCompress(
  page: PageInfo,
  docs: Record<string, LoadedDoc>,
  maxEdge: number
): Promise<HTMLCanvasElement | null> {
  const scale = scaleForPage(page.width, page.height, maxEdge);
  const width = Math.max(1, Math.floor(page.width * scale));
  const height = Math.max(1, Math.floor(page.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  if (page.source.kind === 'blank') return canvas;

  if (page.source.kind === 'image') {
    const blob = new Blob([page.source.bytes], { type: page.source.mime });
    const bitmap = await createImageBitmap(blob);
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    return canvas;
  }

  const doc = docs[page.source.docId];
  if (!doc) return canvas;
  const pdf = await getPdfJsDoc(doc);
  const pdfPage = await pdf.getPage(page.source.pageIndex + 1);
  const viewport = pdfPage.getViewport({ scale, rotation: page.rotation });
  canvas.width = Math.max(1, Math.floor(viewport.width));
  canvas.height = Math.max(1, Math.floor(viewport.height));
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await pdfPage.render({ canvasContext: ctx, viewport }).promise;
  pdfPage.cleanup();
  return canvas;
}

function scaleCanvasToMaxEdge(source: HTMLCanvasElement, maxEdge: number): HTMLCanvasElement {
  const scale = Math.min(1, maxEdge / Math.max(source.width, source.height, 1));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.floor(source.width * scale));
  canvas.height = Math.max(1, Math.floor(source.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
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
