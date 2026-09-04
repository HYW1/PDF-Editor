import { PDFDocument, degrees, rgb } from 'pdf-lib';
import { parsePageUrl } from '../server/parse-page-url.mjs';

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

assert(parsePageUrl('').error === '请输入网址', 'empty url');
assert(parsePageUrl('example.com').href === 'https://example.com/', 'bare host becomes https');
assert(parsePageUrl('https://example.com/path').href === 'https://example.com/path', 'https url');
assert(parsePageUrl('ftp://example.com').error === '只支持 http 或 https 网址', 'reject ftp');
assert(parsePageUrl('http://localhost/x').error === '不能转换内网地址', 'reject localhost');
assert(parsePageUrl('http://127.0.0.1/x').error === '不能转换内网地址', 'reject loopback');
assert(parsePageUrl('http://192.168.0.8/x').error === '不能转换内网地址', 'reject lan');
assert(
  parsePageUrl('http://localhost/x', { allowPrivate: true }).href === 'http://localhost/x',
  'allow localhost when asked'
);

const { groupTextItems } = await import('../src/core/group-text-items.js');
const grouped = groupTextItems([
  { text: 'In', x: 0.1, y: 0.2, width: 0.05, height: 0.03, fontSize: 28 },
  { text: 'voice', x: 0.15, y: 0.201, width: 0.12, height: 0.03, fontSize: 28 },
  { text: 'Next', x: 0.1, y: 0.45, width: 0.1, height: 0.03, fontSize: 16 }
]);
assert(grouped.length === 2, `expected 2 lines, got ${grouped.length}`);
assert(grouped[0].text === 'Invoice', `expected Invoice, got ${grouped[0].text}`);
assert(grouped[1].text === 'Next', `expected Next, got ${grouped[1].text}`);
console.log('text line grouping ok');

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
