import { formatSize } from './quota';
import type { Annotation, LoadedDoc, PageInfo } from './types';

export const COMPRESS_PRESETS = {
  high: {
    maxEdge: 2200,
    jpeg: 0.82,
    bytesPerPixel: 0.18,
    label: '适合打印',
    hint: '更清晰，适合打印和存档'
  },
  medium: {
    maxEdge: 1600,
    jpeg: 0.64,
    bytesPerPixel: 0.11,
    label: '适合发送',
    hint: '清晰度和体积平衡'
  },
  low: {
    maxEdge: 1080,
    jpeg: 0.42,
    bytesPerPixel: 0.06,
    label: '适合微信',
    hint: '体积最小，方便转发'
  }
} as const;

export type CompressQuality = keyof typeof COMPRESS_PRESETS;

export function formatEstimate(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  if (mb >= 10) return `约 ${mb.toFixed(0)} MB`;
  if (mb >= 0.1) return `约 ${mb.toFixed(1)} MB`;
  return `约 ${formatSize(bytes)}`;
}

export function scaleForPage(width: number, height: number, maxEdge: number): number {
  const longEdge = Math.max(width, height, 1);
  return Math.min(maxEdge / longEdge, 3);
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

export function estimateCompressedBytes(pages: PageInfo[], quality: CompressQuality): number {
  const preset = COMPRESS_PRESETS[quality];
  let total = 900;
  for (const page of pages) {
    const scale = scaleForPage(page.width, page.height, preset.maxEdge);
    const pixels = page.width * scale * page.height * scale;
    total += pixels * preset.bytesPerPixel + 1800;
  }
  return Math.max(1024, Math.round(total));
}

export function estimateExportSizes(
  pages: PageInfo[],
  docs: Record<string, LoadedDoc>,
  annotations: Annotation[] = []
) {
  return {
    original: estimateOriginalBytes(pages, docs, annotations),
    high: estimateCompressedBytes(pages, 'high'),
    medium: estimateCompressedBytes(pages, 'medium'),
    low: estimateCompressedBytes(pages, 'low')
  };
}
