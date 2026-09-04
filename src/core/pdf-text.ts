import { groupTextItems } from './group-text-items.js';
import { getPdfJsDoc } from './pdf-render';
import type { LoadedDoc, PageInfo } from './types';

export interface TextLine {
  id: string;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
}

export { groupTextItems };

function transform(left: number[], right: number[]): number[] {
  return [
    left[0] * right[0] + left[2] * right[1],
    left[1] * right[0] + left[3] * right[1],
    left[0] * right[2] + left[2] * right[3],
    left[1] * right[2] + left[3] * right[3],
    left[0] * right[4] + left[2] * right[5] + left[4],
    left[1] * right[4] + left[3] * right[5] + left[5]
  ];
}

export async function extractPageTextLines(
  page: PageInfo,
  docs: Record<string, LoadedDoc>
): Promise<TextLine[]> {
  if (page.source.kind !== 'pdf') return [];
  const doc = docs[page.source.docId];
  if (!doc) return [];
  const pdf = await getPdfJsDoc(doc);
  const pdfPage = await pdf.getPage(page.source.pageIndex + 1);
  const viewport = pdfPage.getViewport({ scale: 1, rotation: page.rotation });
  const content = await pdfPage.getTextContent();
  const items = [];
  for (const raw of content.items) {
    if (!('str' in raw) || !raw.str) continue;
    const tm = transform(viewport.transform, raw.transform);
    const fontSize = Math.hypot(tm[2], tm[3]) || raw.height || 12;
    const widthScale = Math.hypot(tm[0], tm[1]) || 1;
    const width = Math.max(
      raw.width * (widthScale / (Math.hypot(raw.transform[0], raw.transform[1]) || 1)),
      fontSize * 0.3
    );
    const x = tm[4] / viewport.width;
    const y = (tm[5] - fontSize * 0.95) / viewport.height;
    items.push({
      text: raw.str,
      x,
      y,
      width: width / viewport.width,
      height: (fontSize * 1.18) / viewport.height,
      fontSize
    });
  }
  return groupTextItems(items);
}
