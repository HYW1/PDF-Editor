import { PDFDocument, degrees, rgb } from 'pdf-lib';
import { absolutizeUrl, inlineWebPage } from '../server/inline-web-page.mjs';
import { headersForUrl, isNoiseUrl, openAnyPublicPage, textFromHtml } from '../server/open-web-page.mjs';
import { parsePageUrl } from '../server/parse-page-url.mjs';
import {
  articleFallbackHtml,
  fallbackPdfOptions,
  pdfOptionsForWebPage,
  printOpenedPage,
  printPageToPdf,
  textToPdfBytes
} from '../server/prepare-web-pdf.mjs';

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
assert(
  parsePageUrl('这是标题\nhttps://mp.weixin.qq.com/s/abcDEF123\n点击查看').href ===
    'https://mp.weixin.qq.com/s/abcDEF123',
  'extract wechat url from share text'
);
assert(
  parsePageUrl('https://mp.weixin.qq.com/s/abc 还有一段说明').href === 'https://mp.weixin.qq.com/s/abc',
  'trim trailing chinese after wechat url'
);
assert(
  parsePageUrl('weixin://dl/business/?ticket=1').error === '请用微信里「复制链接」得到的 https 网址',
  'reject weixin scheme'
);
assert(isNoiseUrl('https://www.google-analytics.com/g/collect'), 'block analytics');
assert(isNoiseUrl('https://hm.baidu.com/hm.js?abc'), 'block baidu hm');
assert(!isNoiseUrl('https://www.uisdc.com/wp-content/uploads/a.jpg'), 'keep site images');

const webPdf = pdfOptionsForWebPage({ width: 1280, height: 2400 });
assert(webPdf.width === '1100px', `web pdf width ${webPdf.width}`);
assert(webPdf.height === '1556px', `web pdf height ${webPdf.height}`);
assert(webPdf.preferCSSPageSize === false, 'web pdf should ignore print page size');
assert(webPdf.waitForFonts === false, 'pdf should not wait for remote fonts');
assert(webPdf.tagged === false, 'pdf should not require tagged output');
assert(fallbackPdfOptions().format === 'A4', 'fallback pdf should use A4');
{
  const prev = process.env.VERCEL;
  process.env.VERCEL = '1';
  const compact = pdfOptionsForWebPage({ width: 1280, height: 2400 });
  if (prev === undefined) delete process.env.VERCEL;
  else process.env.VERCEL = prev;
  assert(compact.width === '900px', `vercel pdf width ${compact.width}`);
  assert(compact.scale === 0.58, `vercel pdf scale ${compact.scale}`);
}
console.log('web pdf options ok');

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

const first = await PDFDocument.create();
first.addPage([300, 400]).drawText('One', { x: 40, y: 200, size: 20 });
first.addPage([300, 400]).drawText('Two', { x: 40, y: 200, size: 20 });
const second = await PDFDocument.create();
second.addPage([320, 420]).drawText('Three', { x: 40, y: 200, size: 20 });
const merged = await PDFDocument.create();
const firstLoaded = await PDFDocument.load(await first.save());
const secondLoaded = await PDFDocument.load(await second.save());
for (const page of await merged.copyPages(firstLoaded, firstLoaded.getPageIndices())) {
  merged.addPage(page);
}
for (const page of await merged.copyPages(secondLoaded, secondLoaded.getPageIndices())) {
  merged.addPage(page);
}
const mergedBytes = await merged.save({ useObjectStreams: true });
const mergedCheck = await PDFDocument.load(mergedBytes);
assert(mergedCheck.getPageCount() === 3, `merged page count ${mergedCheck.getPageCount()}, expected 3`);
assert(mergedBytes.byteLength > 200, 'merged PDF should not be empty');
console.log('merge pdf ok', { pages: mergedCheck.getPageCount(), bytes: mergedBytes.byteLength });

assert(
  headersForUrl('https://www.uisdc.com/2026-9-design-resources-vol2').Referer === 'https://www.uisdc.com/',
  'public site fetch should send the site origin as referer'
);

{
  const prevVercel = process.env.VERCEL;
  const originalFetch = globalThis.fetch;
  const calls = [];
  process.env.VERCEL = '1';
  globalThis.fetch = async (url) => {
    const href = String(url);
    if (href.endsWith('.css')) {
      const body = Buffer.from('body{color:#111}');
      return { ok: true, url: href, headers: { get: () => 'text/css' }, arrayBuffer: async () => body };
    }
    const html =
      '<html><head><title>优设</title><link rel="stylesheet" href="https://www.uisdc.com/a.css"></head><body><article>大家好，这是 9 月整理的第二波 AI 干货合集</article></body></html>';
    return {
      ok: true,
      url: 'https://www.uisdc.com/2026-9-design-resources-vol2',
      headers: { get: () => 'text/html' },
      arrayBuffer: async () => Buffer.from(html)
    };
  };
  const page = {
    on() {},
    async goto(nextUrl) {
      calls.push(`goto:${String(nextUrl).slice(0, 32)}`);
    },
    async waitForSelector() {},
    async setContent() {
      calls.push('setContent');
    },
    async evaluate() {
      return true;
    }
  };
  try {
    await openAnyPublicPage(page, 'https://www.uisdc.com/2026-9-design-resources-vol2');
    assert(calls.includes('setContent'), 'Vercel should open the downloaded HTML');
    assert(
      !calls.some((item) => item.startsWith('goto:https://www.uisdc.com')),
      'Vercel should not open the live site after a successful download'
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (prevVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = prevVercel;
  }
  console.log('vercel fetch-keep ok');
}

{
  const fake = Buffer.from(`%PDF-1.4\n${'x'.repeat(240)}`);
  const bytes = await printPageToPdf(
    {
      async evaluate() {},
      async createCDPSession() {
        return {
          async send(method, params) {
            if (method !== 'Page.printToPDF') throw new Error(method);
            if (!params.paperWidth || params.generateTaggedPDF) throw new Error('bad cdp pdf params');
            return { data: fake.toString('base64') };
          },
          async detach() {}
        };
      },
      async pdf() {
        throw new Error('should print with cdp first');
      }
    },
    { width: 900, height: 1200 }
  );
  assert(bytes.byteLength === fake.byteLength, 'cdp pdf bytes');
  console.log('cdp pdf print ok');
}

{
  const extracted = textFromHtml(
    '<html><head><title>第二波！2026年9月精选实用 AI 和设计干货合集 - 优设网</title></head><body><article><p>大家好，这是 9 月整理的第二波 AI 干货合集</p></article></body></html>'
  );
  assert(extracted.title.includes('优设网'), 'html title');
  assert(extracted.text.includes('大家好，这是 9 月整理的第二波'), 'html article text');
  assert(!extracted.text.includes('菜单'), 'article extract should skip the site menu');
  const html = articleFallbackHtml('优设合集', extracted.text);
  assert(html.includes('大家好，这是 9 月整理的第二波'), 'fallback html keeps article text');
  const bytes = await textToPdfBytes(extracted.title, `${extracted.text}\n这一期整理了 6 个相对比较全的 Skill 合集。`);
  assert(bytes.byteLength > 200, 'text pdf should not be empty');
  assert(bytes.subarray(0, 4).toString() === '%PDF', 'text pdf header');
  const visual = Buffer.from(`%PDF-1.4\n${'v'.repeat(900)}`);
  const visualResult = await printOpenedPage(
    {
      async evaluate() {},
      async createCDPSession() {
        return {
          async send() {
            return { data: visual.toString('base64') };
          },
          async detach() {}
        };
      },
      async pdf() {
        throw new Error('should use visual cdp');
      }
    },
    {
      size: { width: 900, height: 1200 },
      name: '优设合集.pdf',
      title: extracted.title,
      text: `${extracted.text}\n这一期整理了 6 个相对比较全的 Skill 合集。`
    },
    () => {}
  );
  assert(visualResult.bytes.byteLength === visual.byteLength, 'should keep the visual webpage PDF');
  console.log('visual webpage pdf ok', { bytes: bytes.byteLength });
}

assert(absolutizeUrl('//image.uisdc.com/a.webp', 'https://www.uisdc.com/x') === 'https://image.uisdc.com/a.webp', 'protocol-relative image');
console.log('inline url ok');

{
  const packed = await inlineWebPage('https://www.uisdc.com/2026-9-design-resources-vol2');
  assert(packed.html.includes('大家好'), 'inlined page keeps the article');
  assert(/data:image\//.test(packed.html), 'inlined page embeds images');
  assert(packed.inlined > 2, `expected several images, got ${packed.inlined}`);
  console.log('inline uisdc ok', { inlined: packed.inlined, bytes: packed.html.length });
}

function scaleForPage(width, height, maxEdge) {
  const longEdge = Math.max(width, height, 1);
  return Math.min(1, maxEdge / longEdge);
}
assert(scaleForPage(2000, 1200, 960) < scaleForPage(2000, 1200, 1800), 'tighter size uses smaller scale');
assert(Math.abs(scaleForPage(1800, 1100, 1800) - 1) < 0.001, 'already at target edge');
assert(scaleForPage(400, 400, 1800) === 1, 'never upscale a small page');
assert(scaleForPage(720, 540, 1800) === 1, 'PPT pages stay at 1x');

function clampCompressEstimate(pixelBytes, originalBytes, ratio) {
  const original = Math.max(originalBytes, 1024);
  const fromRatio = Math.round(original * ratio);
  let value = Math.min(Math.max(pixelBytes, 1024), fromRatio);
  if (pixelBytes > original) value = fromRatio;
  if (value >= original) value = Math.round(original * Math.min(ratio + 0.08, 0.92));
  return Math.max(1024, Math.min(value, original - 1));
}
const tinyOriginal = 3800;
const wildPixel = 1.8 * 1024 * 1024;
const printGuess = clampCompressEstimate(wildPixel, tinyOriginal, 0.72);
assert(printGuess < tinyOriginal, 'tiny files should not estimate megabytes');
assert(printGuess < 20 * 1024, 'print estimate should stay near the original');
const bigOriginal = 20 * 1024 * 1024;
const printBig = clampCompressEstimate(8 * 1024 * 1024, bigOriginal, 0.72);
const sendBig = clampCompressEstimate(5 * 1024 * 1024, bigOriginal, 0.4);
const wechatBig = clampCompressEstimate(2 * 1024 * 1024, bigOriginal, 0.18);
assert(printBig < bigOriginal && sendBig < printBig && wechatBig < sendBig, 'sizes should step down');
const pptOriginal = Math.round(15.7 * 1024 * 1024);
const pptPrint = clampCompressEstimate(220 * 1024 * 56, pptOriginal, 0.72);
const pptSend = clampCompressEstimate(120 * 1024 * 56, pptOriginal, 0.4);
const pptWechat = clampCompressEstimate(50 * 1024 * 56, pptOriginal, 0.18);
assert(pptPrint < pptOriginal && pptSend < pptPrint && pptWechat < pptSend, '56-page PPT estimates must stay below the original');
console.log('compress size presets ok');
