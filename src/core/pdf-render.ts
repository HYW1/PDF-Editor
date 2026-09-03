import * as pdfjs from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { fitImage } from './image-fit';
import type { LoadedDoc, PageInfo } from './types';

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;

const docCache = new Map<string, Promise<pdfjs.PDFDocumentProxy>>();
const renderTasks = new WeakMap<HTMLCanvasElement, { cancel: () => void }>();
const renderTokens = new WeakMap<HTMLCanvasElement, number>();

export function cancelRender(canvas: HTMLCanvasElement): void {
  renderTasks.get(canvas)?.cancel();
  renderTasks.delete(canvas);
}

function getPdfJsDoc(doc: LoadedDoc) {
  let cached = docCache.get(doc.id);
  if (!cached) {
    cached = pdfjs.getDocument({ data: new Uint8Array(doc.bytes.slice(0)) }).promise;
    docCache.set(doc.id, cached);
  }
  return cached;
}

export function clearRenderCache(): void {
  docCache.clear();
}

export async function renderPageToCanvas(
  canvas: HTMLCanvasElement,
  page: PageInfo,
  docs: Record<string, LoadedDoc>,
  maxWidth: number
): Promise<void> {
  const ratio = page.height / page.width || 1.414;
  const cssWidth = maxWidth;
  const cssHeight = Math.round(maxWidth * ratio);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;
  canvas.width = Math.round(cssWidth * dpr);
  canvas.height = Math.round(cssHeight * dpr);

  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const token = (renderTokens.get(canvas) || 0) + 1;
  renderTokens.set(canvas, token);
  cancelRender(canvas);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, cssWidth, cssHeight);

  if (page.source.kind === 'blank') {
    drawBlank(ctx, cssWidth, cssHeight);
    return;
  }

  if (page.source.kind === 'image') {
    await drawImagePage(ctx, page, cssWidth, cssHeight);
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
    const task = pdfPage.render({ canvasContext: ctx, viewport });
    renderTasks.set(canvas, task);
    await task.promise;
    renderTasks.delete(canvas);
  } catch (error) {
    if (String(error).includes('RenderingCancelledException')) return;
    console.error('render page failed', error);
    drawPlaceholder(ctx, cssWidth, cssHeight, '无法预览');
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
