import { PDFDocument, degrees, rgb } from 'pdf-lib';

function fitImage(imageW, imageH, pageW, pageH, mode) {
  if (mode === 'original') {
    return { x: (pageW - imageW) / 2, y: (pageH - imageH) / 2, width: imageW, height: imageH };
  }
  const scaleX = pageW / imageW;
  const scaleY = pageH / imageH;
  const scale = mode === 'cover' ? Math.max(scaleX, scaleY) : Math.min(scaleX, scaleY);
  const width = imageW * scale;
  const height = imageH * scale;
  return { x: (pageW - width) / 2, y: (pageH - height) / 2, width, height };
}

function movePage(pages, from, to) {
  const next = [...pages];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

const contain = fitImage(200, 100, 100, 100, 'contain');
assert(contain.width === 100 && contain.height === 50, 'contain should keep ratio and fit inside');
assert(contain.x === 0 && contain.y === 25, 'contain should center leftover space');

const cover = fitImage(200, 100, 100, 100, 'cover');
assert(cover.height === 100 && cover.width === 200, 'cover should fill and keep ratio');
assert(cover.x === -50 && cover.y === 0, 'cover may overflow');

assert(movePage(['a', 'b', 'c'], 0, 2).join('') === 'bca', 'reorder pages');

const src = await PDFDocument.create();
src.addPage([300, 400]);
src.addPage([300, 400]);
src.addPage([500, 500]);
src.getPage(0).drawText('A', { x: 40, y: 200, size: 24 });
src.getPage(1).drawText('B', { x: 40, y: 200, size: 24 });
src.getPage(2).drawText('C', { x: 40, y: 200, size: 24 });
const srcBytes = await src.save();

const working = await PDFDocument.load(srcBytes);
working.removePage(1);
working.getPage(0).setRotation(degrees(90));
working.insertPage(1, [300, 400]);
working.getPage(1).drawRectangle({
  x: 0,
  y: 0,
  width: 300,
  height: 400,
  color: rgb(1, 1, 1)
});

const extra = await PDFDocument.create();
extra.addPage([300, 400]);
const [copied] = await working.copyPages(extra, [0]);
working.addPage(copied);

const outBytes = await working.save();
const check = await PDFDocument.load(outBytes);
assert(check.getPageCount() === 4, `expected 4 pages, got ${check.getPageCount()}`);
assert(check.getPage(0).getRotation().angle === 90, 'first page should be rotated');

console.log('pdf operations ok', {
  pages: check.getPageCount(),
  rotation: check.getPage(0).getRotation().angle,
  bytes: outBytes.length
});
