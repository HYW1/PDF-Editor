import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { writeFile } from 'node:fs/promises';
import { mkdir } from 'node:fs/promises';

const doc = await PDFDocument.create();
const font = await doc.embedFont(StandardFonts.HelveticaBold);

const pages = [
  { title: 'Invoice draft', note: 'Page 1 — keep' },
  { title: 'Unused appendix', note: 'Page 2 — usually deleted' },
  { title: 'Signature page', note: 'Page 3 — add a signature here' }
];

for (const item of pages) {
  const page = doc.addPage([595.28, 841.89]);
  page.drawRectangle({ x: 0, y: 0, width: 595.28, height: 841.89, color: rgb(1, 1, 1) });
  page.drawText('PDF Helper sample', { x: 56, y: 760, size: 14, font, color: rgb(0.26, 0.38, 0.93) });
  page.drawText(item.title, { x: 56, y: 680, size: 28, font, color: rgb(0.1, 0.1, 0.12) });
  page.drawText(item.note, { x: 56, y: 640, size: 16, font, color: rgb(0.35, 0.38, 0.44) });
}

await mkdir('public', { recursive: true });
await writeFile('public/sample.pdf', await doc.save());
console.log('wrote public/sample.pdf');
