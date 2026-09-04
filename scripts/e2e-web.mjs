import { chromium } from 'playwright';
import { mkdir, readFile } from 'node:fs/promises';
import { PDFDocument } from 'pdf-lib';

const outDir = '/opt/cursor/artifacts';
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', (error) => console.error('pageerror', error));
page.on('console', (msg) => {
  if (msg.type() === 'error') console.error('console', msg.text());
});

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await page.getByRole('heading', { name: 'PDF小助手' }).waitFor();
await page.screenshot({ path: `${outDir}/home_desktop.png`, fullPage: true });
console.log('home ok');

await page.getByRole('button', { name: '打开示例 PDF' }).click();
await page.getByText('1 / 3').waitFor({ timeout: 15000 });
await page.waitForTimeout(800);
await page.screenshot({ path: `${outDir}/editor_sample_loaded.png` });
console.log('editor loaded');

await page.getByRole('button', { name: '删除' }).click();
await page.getByText('1 / 2').waitFor({ timeout: 8000 });
console.log('deleted one page');

await page.getByRole('button', { name: '旋转' }).click();
await page.waitForTimeout(400);
console.log('rotated');

await page.getByRole('button', { name: '添加' }).click();
await page.getByRole('button', { name: '＋ 空白页' }).click();
await page.getByRole('button', { name: '纵向（当前页面尺寸）' }).click();
await page.getByText('2 / 3').waitFor({ timeout: 8000 });
console.log('added blank page');

await page.getByRole('button', { name: '文字' }).click();
await page.getByPlaceholder('输入要加到当前页的文字').fill('本地导出测试');
await page.getByRole('button', { name: '添加到页面' }).click();
await page.getByText('本地导出测试').waitFor();
console.log('added text');

const downloadPromise = page.waitForEvent('download', { timeout: 15000 });
await page.getByRole('button', { name: '导出' }).click();
await page.getByRole('button', { name: '直接导出' }).click();
const download = await downloadPromise;
const downloadPath = `${outDir}/exported_sample.pdf`;
await download.saveAs(downloadPath);
const exported = await PDFDocument.load(await readFile(downloadPath));
if (exported.getPageCount() !== 3) {
  throw new Error(`exported page count ${exported.getPageCount()}, expected 3`);
}
console.log('exported', download.suggestedFilename(), 'pages', exported.getPageCount());

const compressDownload = page.waitForEvent('download', { timeout: 30000 });
await page.getByRole('button', { name: '导出' }).click();
await page.getByRole('button', { name: '中画质压缩' }).click();
const compressed = await compressDownload;
const compressedPath = `${outDir}/exported_compressed.pdf`;
await compressed.saveAs(compressedPath);
const compressedPdf = await PDFDocument.load(await readFile(compressedPath));
if (compressedPdf.getPageCount() !== 3) {
  throw new Error(`compressed page count ${compressedPdf.getPageCount()}, expected 3`);
}
console.log('compressed', compressed.suggestedFilename(), 'pages', compressedPdf.getPageCount());

await page.screenshot({ path: `${outDir}/editor_after_edits.png` });

const mobile = await browser.newPage({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true
});
await mobile.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await mobile.getByRole('heading', { name: 'PDF小助手' }).waitFor();
await mobile.screenshot({ path: `${outDir}/home_mobile.png`, fullPage: true });
console.log('mobile home ok');

await mobile.getByRole('button', { name: '网页转 PDF' }).click();
await mobile.getByRole('heading', { name: '这个功能还没有实现' }).waitFor();
await mobile.screenshot({ path: `${outDir}/web_to_pdf_honest.png` });
console.log('web-to-pdf honest page ok');

await browser.close();
console.log('e2e passed');
