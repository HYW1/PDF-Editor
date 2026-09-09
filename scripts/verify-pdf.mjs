import { PDFDocument, degrees, rgb } from 'pdf-lib';
import {
  absolutizeUrl,
  inlineWebPage,
  isPlaceholderUrl,
  PAGE_PRINT_CSS,
  promoteLazyImageHtml
} from '../server/inline-web-page.mjs';
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
  const prevVercel = process.env.VERCEL;
  const originalFetch = globalThis.fetch;
  const calls = [];
  delete process.env.VERCEL;
  globalThis.fetch = async (url) => {
    const href = String(url);
    const html =
      '<html><head><title>站酷</title></head><body><article>耍好手中的笔作品介绍</article></body></html>';
    return {
      ok: true,
      url: href,
      headers: { get: () => 'text/html' },
      arrayBuffer: async () => Buffer.from(html)
    };
  };
  const page = {
    on() {},
    async goto(nextUrl) {
      calls.push(`goto:${String(nextUrl).slice(0, 40)}`);
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
    await openAnyPublicPage(page, 'https://www.zcool.com.cn/work/ZNzQwOTc5Njg=.html');
    assert(calls.includes('setContent'), 'local convert should open the downloaded HTML first');
    assert(
      !calls.some((item) => item.startsWith('goto:https://www.zcool.com.cn')),
      'should not open the live zcool page after a successful download'
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (prevVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = prevVercel;
  }
  console.log('local fetch-first ok');
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
assert(
  absolutizeUrl(
    'https://img.zcool.cn/community/work.jpg?x-oss-process=image&amp;imageMogr2',
    'https://www.zcool.com.cn/work/x.html'
  ) === 'https://img.zcool.cn/community/work.jpg?x-oss-process=image&imageMogr2',
  'decode html entities in image urls'
);
assert(isPlaceholderUrl('https://public-static.zcool.com.cn/git_z/z/images/new/bg-placeholder.jpg'), 'zcool placeholder');
assert(!isPlaceholderUrl('https://img.zcool.cn/community/01abc.jpg'), 'zcool work image is not a placeholder');
{
  const promoted = promoteLazyImageHtml(
    '<img class="lazyload photoImage" data-src="https://img.zcool.cn/community/01abc.jpg?x-oss-process=image" src="https://public-static.zcool.com.cn/git_z/z/images/new/bg-placeholder.jpg">'
  );
  assert(promoted.includes('img.zcool.cn/community/01abc.jpg'), 'promote lazy src to the work image');
  assert(!promoted.includes('bg-placeholder.jpg'), 'drop the gray placeholder src');
}
assert(PAGE_PRINT_CSS.includes('loginGuide'), 'print css hides the zcool login overlay');
assert(PAGE_PRINT_CSS.includes('[class*="Fixed"]'), 'print css unfixes zcool headers');
console.log('inline url ok');

{
  const packed = await inlineWebPage('https://www.uisdc.com/2026-9-design-resources-vol2');
  assert(packed.html.includes('大家好'), 'inlined page keeps the article');
  assert(/data:image\//.test(packed.html), 'inlined page embeds images');
  assert(packed.inlined > 2, `expected several images, got ${packed.inlined}`);
  console.log('inline uisdc ok', { inlined: packed.inlined, bytes: packed.html.length });
}

{
  const originalFetch = globalThis.fetch;
  const fetched = [];
  globalThis.fetch = async (url) => {
    const href = String(url);
    fetched.push(href);
    if (href.includes('bg-placeholder')) {
      throw new Error('should not fetch placeholder images');
    }
    if (href.includes('img.zcool.cn/community')) {
      const body = Buffer.alloc(240, 9);
      return { ok: true, url: href, headers: { get: () => 'image/jpeg' }, arrayBuffer: async () => body };
    }
    if (href.includes('zcool.com.cn/work')) {
      const html =
        '<html><head><title>耍好手中的笔</title></head><body>' +
        '<img class="lazyload photoImage" data-src="https://img.zcool.cn/community/work1.jpg" src="https://public-static.zcool.com.cn/git_z/z/images/new/bg-placeholder.jpg">' +
        '<img class="lazyload photoImage" data-src="https://img.zcool.cn/community/work2.jpg?x-oss-process=image&amp;imageMogr2" src="https://public-static.zcool.com.cn/git_z/z/images/new/bg-placeholder.jpg">' +
        '</body></html>';
      return {
        ok: true,
        url: href,
        headers: { get: () => 'text/html' },
        arrayBuffer: async () => Buffer.from(html)
      };
    }
    throw new Error(`unexpected fetch ${href}`);
  };
  try {
    const packed = await inlineWebPage('https://www.zcool.com.cn/work/ZNzQwOTc5Njg=.html');
    assert(packed.inlined >= 2, `expected zcool work images, got ${packed.inlined}`);
    assert(/data:image\/jpeg/.test(packed.html), 'zcool images are inlined');
    assert(!packed.html.includes('bg-placeholder.jpg'), 'placeholder src is replaced');
    assert(
      fetched.some((item) => item.includes('img.zcool.cn/community/work1.jpg')),
      'fetch the real work image'
    );
    assert(
      fetched.some((item) => item.includes('imageMogr2')),
      'decode &amp; before fetching lazy image urls'
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
  console.log('inline zcool lazy images ok');
}

function scaleForPage(width, height, maxEdge) {
  const longEdge = Math.max(width, height, 1);
  return Math.min(4, maxEdge / longEdge);
}
assert(scaleForPage(2000, 1200, 960) < scaleForPage(2000, 1200, 1800), 'tighter size uses smaller scale');
assert(Math.abs(scaleForPage(1800, 1100, 1800) - 1) < 0.001, 'already at target edge');
assert(scaleForPage(400, 400, 1800) > 1, 'print raster can exceed PDF points');
assert(scaleForPage(720, 540, 1800) > 2, 'PPT print pages render above screen dpi');
assert(scaleForPage(825, 1167, 2600) > 2, 'web-to-pdf high quality is not stuck at 72dpi');

function compressProfile(_originalBytes, _pageCount, quality) {
  const presets = {
    high: { maxEdge: 2600, jpegQuality: 0.91 },
    medium: { maxEdge: 1800, jpegQuality: 0.82 },
    low: { maxEdge: 1200, jpegQuality: 0.64 }
  };
  return presets[quality];
}
const printProfile = compressProfile(21.2 * 1024 * 1024, 19, 'high');
assert(printProfile.maxEdge >= 2400, 'high compress keeps a large pixel edge');
assert(printProfile.jpegQuality >= 0.88 && printProfile.jpegQuality < 0.94, 'high jpeg should shrink without going mushy');

function clampCompressEstimate(pixelBytes, originalBytes) {
  const original = Math.max(originalBytes, 1024);
  const value = Math.max(1024, Math.round(pixelBytes));
  if (value >= original) return original - 1;
  return value;
}
function formatEstimate(bytes) {
  const mb = bytes / (1024 * 1024);
  if (mb >= 0.1) return `约 ${mb.toFixed(1)} MB`;
  return `约 ${bytes} B`;
}
assert(formatEstimate(16.4 * 1024 * 1024) === '约 16.4 MB', 'estimates keep one decimal');
assert(formatEstimate(11.2 * 1024 * 1024) === '约 11.2 MB', '11.2 mb stays 11.2');

const tinyOriginal = 3800;
const wildPixel = 1.8 * 1024 * 1024;
const printGuess = clampCompressEstimate(wildPixel, tinyOriginal);
assert(printGuess < tinyOriginal, 'tiny files should not estimate megabytes');
assert(printGuess < 20 * 1024, 'print estimate should stay near the original');
const bigOriginal = 21.2 * 1024 * 1024;
const measuredHigh = 11.2 * 1024 * 1024;
const printBig = clampCompressEstimate(measuredHigh, bigOriginal);
assert(Math.abs(printBig - measuredHigh) < 1024, 'estimate should follow measured jpeg size');
assert(printBig > 10 * 1024 * 1024 && printBig < 12 * 1024 * 1024, '11.2MB should not be shown as 16MB');
const sendBig = clampCompressEstimate(6.1 * 1024 * 1024, bigOriginal);
const wechatBig = clampCompressEstimate(3.2 * 1024 * 1024, bigOriginal);
assert(printBig < bigOriginal && sendBig < printBig && wechatBig < sendBig, 'sizes should step down');

function estimateFromSamples(sampleJpegBytes, pageCount, originalBytes) {
  const usable = sampleJpegBytes.filter((item) => item > 0);
  const avg = usable.reduce((sum, item) => sum + item, 0) / usable.length;
  const overhead = 900 + 220 * pageCount;
  return clampCompressEstimate(avg * pageCount + overhead, originalBytes);
}
const sampled = estimateFromSamples([248_000, 252_000], 45, bigOriginal);
assert(Math.abs(sampled - (250_000 * 45 + 900 + 220 * 45)) < 1, `sample estimate ${sampled}`);
assert(Math.abs(sampled / (1024 * 1024) - 10.7) < 0.2, 'sample estimate stays within 0.2MB');

function pickShrinkingEstimate(candidates, originalBytes) {
  const usable = candidates.filter((item) => item > 0);
  const shrinking = usable.filter((item) => item < originalBytes * 0.97);
  return shrinking[0] || usable[usable.length - 1] || 0;
}
assert(
  Math.abs(pickShrinkingEstimate([bigOriginal - 50, bigOriginal * 0.78, bigOriginal * 0.5], bigOriginal) - bigOriginal * 0.78) < 1,
  'high estimate should pick the first size that actually shrinks'
);
assert(
  pickShrinkingEstimate([bigOriginal - 10, bigOriginal - 20], bigOriginal) === bigOriginal - 20,
  'if nothing shrinks enough, keep the smallest high-quality try'
);

function estimateCompressedBytes(pages, quality, originalBytes) {
  const preset = {
    high: { maxEdge: 2600, bytesPerPixel: 0.06 },
    medium: { maxEdge: 1800, bytesPerPixel: 0.052 },
    low: { maxEdge: 1200, bytesPerPixel: 0.034 }
  }[quality];
  let pixel = 900;
  for (const page of pages) {
    const scale = scaleForPage(page.width, page.height, preset.maxEdge);
    const pixels = page.width * scale * page.height * scale;
    pixel += pixels * preset.bytesPerPixel + 1800;
  }
  return clampCompressEstimate(Math.round(pixel), originalBytes);
}
const zcoolPages = Array.from({ length: 45 }, () => ({ width: 825, height: 1167 }));
const zcoolPrint = estimateCompressedBytes(zcoolPages, 'high', bigOriginal);
assert(zcoolPrint < bigOriginal - 1.5 * 1024 * 1024, 'high quality must estimate smaller than direct export');
assert(zcoolPrint > 8 * 1024 * 1024, 'high quality should stay well above the blurry 4-11MB range');
assert(
  estimateCompressedBytes(zcoolPages, 'medium', bigOriginal) < zcoolPrint,
  'medium should estimate smaller than high'
);
console.log('compress size presets ok', { zcoolPrintMb: (zcoolPrint / 1024 / 1024).toFixed(1) });
