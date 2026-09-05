import { generateId } from './id';
import { fitImage } from './image-fit';
import type { Annotation, FitMode, LoadedDoc, PageInfo } from './types';

const A4 = { width: 595.28, height: 841.89 };

export async function loadPdfFile(file: File): Promise<{ doc: LoadedDoc; pages: PageInfo[] }> {
  const bytes = await file.arrayBuffer();
  return loadPdfBytes(bytes, file.name);
}

export function copyBuffer(bytes: ArrayBuffer): ArrayBuffer {
  return bytes.slice(0);
}

export async function loadPdfBytes(
  bytes: ArrayBuffer,
  name: string
): Promise<{ doc: LoadedDoc; pages: PageInfo[] }> {
  const { primePdfJsDoc } = await import('./pdf-render');
  const safeBytes = bytes.byteLength ? bytes : copyBuffer(bytes);
  const docId = generateId('doc');
  const pdf = await primePdfJsDoc(docId, safeBytes);
  const pageCount = pdf.numPages;
  const pages: PageInfo[] = [];
  const batch = 8;
  for (let start = 1; start <= pageCount; start += batch) {
    const end = Math.min(pageCount, start + batch - 1);
    const slice = await Promise.all(
      Array.from({ length: end - start + 1 }, (_, offset) => pdf.getPage(start + offset))
    );
    for (const [offset, pdfPage] of slice.entries()) {
      const viewport = pdfPage.getViewport({ scale: 1, rotation: 0 });
      const rotation = normalizeRotation(pdfPage.rotate || 0);
      pages.push({
        id: generateId('page'),
        width: viewport.width,
        height: viewport.height,
        rotation,
        nativeRotation: rotation,
        source: { kind: 'pdf', docId, pageIndex: start + offset - 1 }
      });
    }
  }
  const doc: LoadedDoc = { id: docId, name, bytes: safeBytes, pageCount };
  return { doc, pages };
}

function defaultPageSize(pages: PageInfo[]): { width: number; height: number } {
  const current = pages[0];
  return current ? { width: current.width, height: current.height } : A4;
}

export function makeBlankPage(pages: PageInfo[], landscape = false): PageInfo {
  const size = defaultPageSize(pages);
  const width = landscape ? Math.max(size.width, size.height) : size.width;
  const height = landscape ? Math.min(size.width, size.height) : size.height;
  return {
    id: generateId('page'),
    width,
    height,
    rotation: 0,
    source: { kind: 'blank' }
  };
}

export async function makeImagePages(
  files: File[],
  pageSize: { width: number; height: number },
  fit: FitMode
): Promise<PageInfo[]> {
  const result: PageInfo[] = [];
  for (const file of files) {
    const bytes = copyBuffer(await file.arrayBuffer());
    result.push({
      id: generateId('page'),
      width: pageSize.width,
      height: pageSize.height,
      rotation: 0,
      source: {
        kind: 'image',
        bytes,
        mime: file.type || guessMime(file.name),
        name: file.name,
        fit
      }
    });
  }
  return result;
}

export function rotatePage(page: PageInfo, delta = 90): PageInfo {
  return { ...page, rotation: normalizeRotation(page.rotation + delta), nativeRotation: page.nativeRotation };
}

export function movePage(pages: PageInfo[], from: number, to: number): PageInfo[] {
  if (from === to || from < 0 || to < 0 || from >= pages.length || to >= pages.length) {
    return pages;
  }
  const next = [...pages];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function insertPages(
  pages: PageInfo[],
  incoming: PageInfo[],
  index: number,
  position: 'before' | 'after'
): PageInfo[] {
  const at = position === 'before' ? index : index + 1;
  return [...pages.slice(0, at), ...incoming, ...pages.slice(at)];
}

function canPassthroughOriginal(
  pages: PageInfo[],
  docs: Record<string, LoadedDoc>,
  annotations: Annotation[]
): ArrayBuffer | null {
  if (annotations.length || !pages.length) return null;
  const first = pages[0];
  if (first.source.kind !== 'pdf') return null;
  const doc = docs[first.source.docId];
  if (!doc || pages.length !== doc.pageCount) return null;
  for (let index = 0; index < pages.length; index += 1) {
    const page = pages[index];
    if (page.source.kind !== 'pdf') return null;
    if (page.source.docId !== first.source.docId || page.source.pageIndex !== index) return null;
    if (page.rotation !== (page.nativeRotation ?? 0)) return null;
  }
  return doc.bytes;
}

export async function exportPdf(
  pages: PageInfo[],
  docs: Record<string, LoadedDoc>,
  annotations: Annotation[],
  onProgress?: (done: number, total: number) => void
): Promise<Uint8Array> {
  const original = canPassthroughOriginal(pages, docs, annotations);
  if (original) {
    onProgress?.(pages.length, pages.length);
    return new Uint8Array(original.slice(0));
  }

  const { PDFDocument, degrees } = await import('pdf-lib');

  const out = await PDFDocument.create();
  const neededIds = [
    ...new Set(
      pages.flatMap((page) => (page.source.kind === 'pdf' ? [page.source.docId] : []))
    )
  ];
  const loadedCache = new Map<string, Awaited<ReturnType<typeof PDFDocument.load>>>();
  await Promise.all(
    neededIds.map(async (docId) => {
      const doc = docs[docId];
      if (!doc) throw new Error('源 PDF 不存在');
      loadedCache.set(
        docId,
        await PDFDocument.load(copyBuffer(doc.bytes), { ignoreEncryption: true, updateMetadata: false })
      );
    })
  );

  const unusedCopies = new Map<string, ReturnType<typeof out.addPage>[]>();
  for (const docId of neededIds) {
    const src = loadedCache.get(docId);
    if (!src) continue;
    const indices = [
      ...new Set(
        pages.flatMap((page) =>
          page.source.kind === 'pdf' && page.source.docId === docId ? [page.source.pageIndex] : []
        )
      )
    ].sort((a, b) => a - b);
    if (!indices.length) continue;
    const copied = await out.copyPages(src, indices);
    for (let i = 0; i < indices.length; i += 1) {
      const key = `${docId}:${indices[i]}`;
      const list = unusedCopies.get(key) || [];
      list.push(copied[i]);
      unusedCopies.set(key, list);
    }
  }

  const annsByPage = new Map<string, Annotation[]>();
  for (const item of annotations) {
    const list = annsByPage.get(item.pageId) || [];
    list.push(item);
    annsByPage.set(item.pageId, list);
  }

  for (let index = 0; index < pages.length; index += 1) {
    const page = pages[index];
    onProgress?.(index + 1, pages.length);
    const dest = await appendPage(out, page, loadedCache, unusedCopies);
    if (page.rotation) {
      dest.setRotation(degrees(page.rotation));
    }
    const pageAnns = annsByPage.get(page.id) || [];
    for (const ann of pageAnns) {
      await drawAnnotation(out, dest, page, ann);
    }
  }

  return out.save({ useObjectStreams: false });
}

async function takeCopiedPage(
  out: Awaited<ReturnType<(typeof import('pdf-lib'))['PDFDocument']['create']>>,
  src: Awaited<ReturnType<(typeof import('pdf-lib'))['PDFDocument']['load']>>,
  unusedCopies: Map<string, ReturnType<typeof out.addPage>[]>,
  docId: string,
  pageIndex: number
) {
  const key = `${docId}:${pageIndex}`;
  const queued = unusedCopies.get(key);
  const ready = queued?.pop();
  if (ready) return ready;
  const [copied] = await out.copyPages(src, [pageIndex]);
  return copied;
}

async function appendPage(
  out: Awaited<ReturnType<(typeof import('pdf-lib'))['PDFDocument']['create']>>,
  page: PageInfo,
  loadedCache: Map<string, Awaited<ReturnType<(typeof import('pdf-lib'))['PDFDocument']['load']>>>,
  unusedCopies: Map<string, ReturnType<typeof out.addPage>[]>
) {
  if (page.source.kind === 'pdf') {
    const src = loadedCache.get(page.source.docId);
    if (!src) throw new Error('源 PDF 不存在');
    const copied = await takeCopiedPage(out, src, unusedCopies, page.source.docId, page.source.pageIndex);
    out.addPage(copied);
    return copied;
  }

  const dest = out.addPage([page.width, page.height]);
  const { rgb, clip, endPath, popGraphicsState, pushGraphicsState, rectangle } = await import('pdf-lib');

  if (page.source.kind === 'blank') {
    dest.drawRectangle({
      x: 0,
      y: 0,
      width: page.width,
      height: page.height,
      color: rgb(1, 1, 1)
    });
    return dest;
  }

  const pngBytes = await normalizeImageBytes(page.source.bytes, page.source.mime);
  const image = looksLikeJpeg(page.source.mime, page.source.name)
    ? await embedJpegSafe(out, page.source.bytes, pngBytes)
    : await out.embedPng(pngBytes);
  const rect = fitImage(image.width, image.height, page.width, page.height, page.source.fit);

  if (page.source.fit === 'cover') {
    dest.pushOperators(
      pushGraphicsState(),
      rectangle(0, 0, page.width, page.height),
      clip(),
      endPath()
    );
  }

  dest.drawImage(image, rect);

  if (page.source.fit === 'cover') {
    dest.pushOperators(popGraphicsState());
  }

  return dest;
}

async function embedJpegSafe(
  out: Awaited<ReturnType<(typeof import('pdf-lib'))['PDFDocument']['create']>>,
  original: ArrayBuffer,
  pngFallback: Uint8Array
) {
  try {
    return await out.embedJpg(original);
  } catch {
    return out.embedPng(pngFallback);
  }
}

async function drawAnnotation(
  out: Awaited<ReturnType<(typeof import('pdf-lib'))['PDFDocument']['create']>>,
  dest: ReturnType<Awaited<ReturnType<(typeof import('pdf-lib'))['PDFDocument']['create']>>['addPage']>,
  page: PageInfo,
  ann: Annotation
) {
  const { rgb } = await import('pdf-lib');
  const x = ann.x * page.width;
  const y = page.height - (ann.y + ann.height) * page.height;
  const width = ann.width * page.width;
  const height = ann.height * page.height;

  if (ann.type === 'replace' || ann.type === 'text') {
    if (ann.type === 'replace') {
      dest.drawRectangle({
        x,
        y,
        width,
        height,
        color: rgb(1, 1, 1)
      });
    }
    const png = await renderTextPng(
      ann.content,
      width,
      height,
      ann.fontSize || 16,
      ann.color || '#111111',
      ann.type === 'replace'
    );
    const image = await out.embedPng(png);
    dest.drawImage(image, { x, y, width, height });
    return;
  }

  const bytes = dataUrlToBytes(ann.content);
  const image = await out.embedPng(bytes);
  dest.drawImage(image, { x, y, width, height });
}

function renderTextPng(
  text: string,
  widthPt: number,
  heightPt: number,
  fontSize: number,
  color: string,
  singleLine = false
): Promise<Uint8Array> {
  if (typeof document === 'undefined') {
    throw new Error('文字导出需要在浏览器中进行');
  }
  const scale = 2;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(2, Math.round(widthPt * scale));
  canvas.height = Math.max(2, Math.round(heightPt * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('无法创建文字画布');
  ctx.scale(scale, scale);
  ctx.clearRect(0, 0, widthPt, heightPt);
  ctx.fillStyle = color;
  ctx.font = `${fontSize}px "PingFang SC","Noto Sans SC","Microsoft YaHei",sans-serif`;
  if (singleLine) {
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 0, heightPt / 2, widthPt);
  } else {
    ctx.textBaseline = 'top';
    wrapText(ctx, text, 0, 2, widthPt, fontSize * 1.3);
  }
  return canvasToPng(canvas);
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number
) {
  const chars = [...text];
  let line = '';
  let cursorY = y;
  for (const ch of chars) {
    const next = line + ch;
    if (ctx.measureText(next).width > maxWidth && line) {
      ctx.fillText(line, x, cursorY);
      line = ch;
      cursorY += lineHeight;
    } else {
      line = next;
    }
  }
  if (line) ctx.fillText(line, x, cursorY);
}

function canvasToPng(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('导出文字失败'));
        return;
      }
      blob.arrayBuffer().then((buf) => resolve(new Uint8Array(buf))).catch(reject);
    }, 'image/png');
  });
}

async function normalizeImageBytes(bytes: ArrayBuffer, mime: string): Promise<Uint8Array> {
  if (mime === 'image/png' || mime === 'image/jpeg' || mime === 'image/jpg') {
    return new Uint8Array(bytes);
  }
  if (typeof createImageBitmap === 'undefined') {
    return new Uint8Array(bytes);
  }
  const blob = new Blob([bytes], { type: mime || 'image/png' });
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('无法转换图片');
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  return canvasToPng(canvas);
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(',')[1];
  if (!base64) throw new Error('签名数据无效');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function guessMime(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.bmp')) return 'image/bmp';
  return 'image/png';
}

function looksLikeJpeg(mime: string, name: string): boolean {
  return mime === 'image/jpeg' || mime === 'image/jpg' || /\.jpe?g$/i.test(name);
}

function normalizeRotation(angle: number): number {
  const value = ((angle % 360) + 360) % 360;
  return value;
}

export { A4 };
