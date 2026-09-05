import * as pdfjs from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { fitImage } from './image-fit';
import type { LoadedDoc, PageInfo } from './types';

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;

const docCache = new Map<string, Promise<pdfjs.PDFDocumentProxy>>();
const bitmapCache = new Map<string, ImageBitmap>();
const renderTasks = new WeakMap<HTMLCanvasElement, { cancel: () => void }>();
const renderTokens = new WeakMap<HTMLCanvasElement, number>();
const MAX_BITMAPS = 16;

export type RenderQuality = 'thumb' | 'preview' | 'export';

export function cancelRender(canvas: HTMLCanvasElement): void {
  renderTasks.get(canvas)?.cancel();
  renderTasks.delete(canvas);
}

export function primePdfJsDoc(docId: string, bytes: ArrayBuffer) {
  let cached = docCache.get(docId);
  if (!cached) {
    cached = pdfjs
      .getDocument({
        data: new Uint8Array(bytes.slice(0)),
        disableAutoFetch: true,
        disableStream: true,
        isEvalSupported: false
      })
      .promise;
    docCache.set(docId, cached);
  }
  return cached;
}

export function getPdfJsDoc(doc: LoadedDoc) {
  return primePdfJsDoc(doc.id, doc.bytes);
}

export function warmupPdfEngine(): void {
  void import('pdf-lib');
}

function closeBitmap(key: string) {
  const prev = bitmapCache.get(key);
  if (prev) {
    prev.close();
    bitmapCache.delete(key);
  }
}

function rememberBitmap(key: string, bitmap: ImageBitmap) {
  if (bitmapCache.size >= MAX_BITMAPS) {
    const oldest = bitmapCache.keys().next().value;
    if (oldest) closeBitmap(oldest);
  }
  closeBitmap(key);
  bitmapCache.set(key, bitmap);
}

export function clearRenderCache(): void {
  docCache.clear();
  for (const key of [...bitmapCache.keys()]) closeBitmap(key);
}

export function pageRenderKey(page: PageInfo): string {
  if (page.source.kind === 'pdf') {
    return `pdf:${page.source.docId}:${page.source.pageIndex}:${page.rotation}`;
  }
  if (page.source.kind === 'image') {
    return `img:${page.id}:${page.source.fit}:${page.rotation}`;
  }
  return `blank:${page.id}:${page.width}x${page.height}`;
}

function cacheKey(page: PageInfo, maxWidth: number, dpr: number, quality: RenderQuality): string {
  return `${pageRenderKey(page)}:${maxWidth}:${dpr}:${quality}`;
}

export async function renderPageToCanvas(
  canvas: HTMLCanvasElement,
  page: PageInfo,
  docs: Record<string, LoadedDoc>,
  maxWidth: number,
  quality: RenderQuality = 'preview'
): Promise<void> {
  const ratio = page.height / page.width || 1.414;
  const cssWidth = maxWidth;
  const cssHeight = Math.round(maxWidth * ratio);
  const dprCap = quality === 'thumb' ? 1 : quality === 'export' ? 2 : Math.min(window.devicePixelRatio || 1, 2);
  const dpr = dprCap;
  const key = cacheKey(page, cssWidth, dpr, quality);

  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;

  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) return;
  const token = (renderTokens.get(canvas) || 0) + 1;
  renderTokens.set(canvas, token);
  cancelRender(canvas);

  const cached = bitmapCache.get(key);
  if (cached) {
    canvas.width = cached.width;
    canvas.height = cached.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(cached, 0, 0);
    return;
  }

  canvas.width = Math.round(cssWidth * dpr);
  canvas.height = Math.round(cssHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, cssWidth, cssHeight);

  if (page.source.kind === 'blank') {
    drawBlank(ctx, cssWidth, cssHeight);
    return;
  }

  if (page.source.kind === 'image') {
    await drawImagePage(ctx, page, cssWidth, cssHeight);
    if (renderTokens.get(canvas) === token && quality !== 'export') {
      void storeCanvasBitmap(canvas, key);
    }
    return;
  }

  const doc = docs[page.source.docId];
  if (!doc) {
    drawPlaceholder(ctx, cssWidth, cssHeight, '缺失');
    return;
  }

  try {
    const pdf = await getPdfJsDoc(doc);
    if (renderTokens.get(canvas) !== token) return;
    const pdfPage = await pdf.getPage(page.source.pageIndex + 1);
    const base = pdfPage.getViewport({ scale: 1, rotation: page.rotation });
    const scale = cssWidth / base.width;
    const viewport = pdfPage.getViewport({ scale, rotation: page.rotation });
    canvas.style.height = `${viewport.height}px`;
    canvas.height = Math.round(viewport.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, viewport.width, viewport.height);
    const task = pdfPage.render({
      canvasContext: ctx,
      viewport,
      annotationMode:
        quality === 'thumb'
          ? pdfjs.AnnotationMode?.DISABLE ?? 0
          : pdfjs.AnnotationMode?.ENABLE ?? 1
    });
    renderTasks.set(canvas, task);
    await task.promise;
    renderTasks.delete(canvas);
    if (renderTokens.get(canvas) === token && quality !== 'export') {
      void storeCanvasBitmap(canvas, key);
    }
  } catch (error) {
    if (String(error).includes('RenderingCancelledException')) return;
    console.error('render page failed', error);
    drawPlaceholder(ctx, cssWidth, cssHeight, '无法预览');
  }
}

async function storeCanvasBitmap(canvas: HTMLCanvasElement, key: string) {
  try {
    const bitmap = await createImageBitmap(canvas);
    rememberBitmap(key, bitmap);
  } catch {
    // Ignore cache failures; the live canvas already has the page.
  }
}

async function drawImagePage(
  ctx: CanvasRenderingContext2D,
  page: PageInfo,
  cssWidth: number,
  cssHeight: number
) {
  if (page.source.kind !== 'image') return;
  const blob = new Blob([page.source.bytes], { type: page.source.mime || 'image/png' });
  const bitmap = await createImageBitmap(blob);
  const rect = fitImage(bitmap.width, bitmap.height, cssWidth, cssHeight, page.source.fit);
  ctx.save();
  if (page.source.fit === 'cover') {
    ctx.beginPath();
    ctx.rect(0, 0, cssWidth, cssHeight);
    ctx.clip();
  }
  ctx.drawImage(bitmap, rect.x, rect.y, rect.width, rect.height);
  ctx.restore();
  bitmap.close();
}

function drawBlank(ctx: CanvasRenderingContext2D, width: number, height: number) {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = '#ececec';
  ctx.setLineDash([6, 6]);
  ctx.strokeRect(8, 8, width - 16, height - 16);
  ctx.setLineDash([]);
  ctx.fillStyle = '#c5c5c5';
  ctx.font = '13px system-ui,sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('空白页', width / 2, height / 2);
}

function drawPlaceholder(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  label: string
) {
  ctx.fillStyle = '#f4f4f4';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#999999';
  ctx.font = '13px system-ui,sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, width / 2, height / 2);
}
