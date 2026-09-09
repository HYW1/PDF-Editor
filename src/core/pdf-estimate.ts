import { formatSize } from './quota';
import type { Annotation, LoadedDoc, PageInfo } from './types';

export const COMPRESS_PRESETS = {
  high: {
    maxEdge: 2600,
    jpeg: 0.91,
    bytesPerPixel: 0.06,
    ratio: 0.78,
    label: '高质量',
    hint: '尽量保持清晰，文件会小一截'
  },
  medium: {
    maxEdge: 1800,
    jpeg: 0.82,
    bytesPerPixel: 0.052,
    ratio: 0.55,
    label: '中质量',
    hint: '清晰和体积比较均衡'
  },
  low: {
    maxEdge: 1200,
    jpeg: 0.64,
    bytesPerPixel: 0.034,
    ratio: 0.32,
    label: '低质量',
    hint: '文件更小，画质一般'
  }
} as const;

export type CompressQuality = keyof typeof COMPRESS_PRESETS;

export function formatEstimate(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  if (mb >= 0.1) return `约 ${mb.toFixed(1)} MB`;
  return `约 ${formatSize(bytes)}`;
}

export function scaleForPage(width: number, height: number, maxEdge: number): number {
  const longEdge = Math.max(width, height, 1);
  return Math.min(4, maxEdge / longEdge);
}

export function compressProfile(
  _originalBytes: number,
  _pageCount: number,
  quality: CompressQuality
): { maxEdge: number; jpegQuality: number } {
  const preset = COMPRESS_PRESETS[quality];
  return { maxEdge: preset.maxEdge, jpegQuality: preset.jpeg };
}

export function estimateOriginalBytes(
  pages: PageInfo[],
  docs: Record<string, LoadedDoc>,
  annotations: Annotation[] = []
): number {
  const byDoc = new Map<string, Set<number>>();
  let extra = 800;
  for (const page of pages) {
    if (page.source.kind === 'pdf') {
      let set = byDoc.get(page.source.docId);
      if (!set) {
        set = new Set();
        byDoc.set(page.source.docId, set);
      }
      set.add(page.source.pageIndex);
    } else if (page.source.kind === 'image') {
      extra += page.source.bytes.byteLength * 0.65 + 2000;
    } else {
      extra += 1400;
    }
  }
  for (const [docId, indices] of byDoc) {
    const doc = docs[docId];
    if (!doc) continue;
    const used = indices.size;
    const assumed = Math.max(used, Math.max(...indices) + 1);
    extra += (doc.bytes.byteLength * used) / assumed;
  }
  for (const item of annotations) {
    extra += item.type === 'signature' ? Math.max(8000, item.content.length * 0.55) : 500;
  }
  return Math.max(1024, Math.round(extra));
}

export function clampCompressEstimate(pixelBytes: number, originalBytes: number, _ratio = 1): number {
  const original = Math.max(originalBytes, 1024);
  const value = Math.max(1024, Math.round(pixelBytes));
  if (value >= original) return original - 1;
  return value;
}

export function estimateFromSamples(
  sampleJpegBytes: number[],
  pageCount: number,
  originalBytes: number
): number {
  const usable = sampleJpegBytes.filter((item) => item > 0);
  if (!usable.length) return 0;
  const avg = usable.reduce((sum, item) => sum + item, 0) / usable.length;
  const overhead = 900 + 220 * Math.max(1, pageCount);
  return clampCompressEstimate(avg * Math.max(1, pageCount) + overhead, originalBytes);
}

export function estimateCompressedBytes(
  pages: PageInfo[],
  quality: CompressQuality,
  originalBytes = 0
): number {
  const preset = COMPRESS_PRESETS[quality];
  let pixel = 900;
  for (const page of pages) {
    const scale = scaleForPage(page.width, page.height, preset.maxEdge);
    const pixels = page.width * scale * page.height * scale;
    pixel += pixels * preset.bytesPerPixel + 1800;
  }
  pixel = Math.round(pixel);
  if (!originalBytes) return Math.max(1024, pixel);
  return clampCompressEstimate(pixel, originalBytes, preset.ratio);
}

export function estimateExportSizes(
  pages: PageInfo[],
  docs: Record<string, LoadedDoc>,
  annotations: Annotation[] = []
) {
  const original = estimateOriginalBytes(pages, docs, annotations);
  const high = estimateCompressedBytes(pages, 'high', original);
  const medium = Math.min(high, estimateCompressedBytes(pages, 'medium', original));
  const low = Math.min(medium, estimateCompressedBytes(pages, 'low', original));
  return { original, high, medium, low };
}
