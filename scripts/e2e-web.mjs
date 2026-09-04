import { chromium } from 'playwright';
import { mkdir, readFile } from 'node:fs/promises';
import { PDFDocument } from 'pdf-lib';

async function assertNavInline(locator, label) {
  const metrics = await locator.evaluate((el) => {
    const row = el.querySelector('.nav-back');
    const icon = row?.querySelector('.nav-chevron-icon, svg');
    const text = row?.querySelector('.nav-back-text');
    if (!row || !icon || !text) return { error: 'missing nodes' };
    const ib = icon.getBoundingClientRect();
    const tb = text.getBoundingClientRect();
    return {
      iconCenterY: ib.y + ib.height / 2,
      textCenterY: tb.y + tb.height / 2,
      iconRight: ib.right,
      textLeft: tb.left,
      stacked: ib.bottom <= tb.top + 1 || tb.bottom <= ib.top + 1,
      buttonHeight: el.getBoundingClientRect().height
    };
  });
  if (metrics.error || metrics.stacked || metrics.textLeft < metrics.iconRight - 2) {
    throw new Error(`${label} not inline: ${JSON.stringify(metrics)}`);
  }
  if (Math.abs(metrics.iconCenterY - metrics.textCenterY) > 4) {
    throw new Error(`${label} vertical misaligned: ${JSON.stringify(metrics)}`);
  }
}

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
if (await page.getByRole('button', { name: '打开示例 PDF' }).count()) {
  throw new Error('sample PDF button should be removed from home');
}
await page.screenshot({ path: `${outDir}/home_desktop.png`, fullPage: true });
console.log('home ok');

await page.getByRole('button', { name: '网页转 PDF' }).click();
await page.getByLabel('网址').waitFor();
const webBack = page.getByRole('button', { name: '返回', exact: true });
await assertNavInline(webBack, 'web-to-pdf back');
await page.screenshot({ path: `${outDir}/web_to_pdf_form.png` });
await page.getByLabel('网址').fill('http://localhost:5173/web-fixture.html');
await page.getByRole('button', { name: '生成 PDF' }).click();
await page.getByText(/1 \/ \d+/).waitFor({ timeout: 40000 });
await page.screenshot({ path: `${outDir}/web_to_pdf_editor.png` });
await page.getByRole('button', { name: '返回', exact: true }).click();
await page.getByRole('heading', { name: 'PDF小助手' }).waitFor();
console.log('web-to-pdf converted');

const [fileChooser] = await Promise.all([
  page.waitForEvent('filechooser'),
  page.getByRole('button', { name: '编辑 PDF' }).click()
]);
await fileChooser.setFiles('public/sample.pdf');
await page.getByText('1 / 3').waitFor({ timeout: 15000 });
await page.waitForTimeout(800);
await page.screenshot({ path: `${outDir}/editor_sample_loaded.png` });
const editorBack = page.getByRole('button', { name: '返回', exact: true });
await assertNavInline(editorBack, 'editor back');
await page.locator('.topbar').screenshot({ path: `${outDir}/editor_topbar_full.png` });
await page.locator('.history-btns').screenshot({ path: `${outDir}/undo_redo_icons.png` });
await page.locator('.toolbar').screenshot({ path: `${outDir}/toolbar_icons.png` });
console.log('editor loaded');

await page.getByRole('button', { name: '签名' }).click();
await page.getByText('手写签名', { exact: true }).waitFor();
const sigCancel = page.getByRole('button', { name: '取消' });
await assertNavInline(sigCancel, 'signature cancel');
await page.screenshot({ path: `${outDir}/signature_topbar.png`, clip: { x: 0, y: 0, width: 420, height: 72 } });
await sigCancel.click();
await page.getByText('1 / 3').waitFor();
console.log('signature cancel aligned');

await page.getByRole('button', { name: '添加' }).click();
const [addChooser] = await Promise.all([
  page.waitForEvent('filechooser'),
  page.getByRole('button', { name: '＋ PDF' }).click()
]);
await addChooser.setFiles('public/sample.pdf');
await page.getByRole('button', { name: '全选' }).waitFor({ timeout: 15000 });
await assertNavInline(page.getByRole('button', { name: '取消', exact: true }), 'page selector cancel');
await page.screenshot({ path: `${outDir}/page_selector_topbar.png`, clip: { x: 0, y: 0, width: 420, height: 72 } });
await page.getByRole('button', { name: '取消', exact: true }).click();
await page.getByText('1 / 3').waitFor();
console.log('page selector cancel aligned');

await page.getByRole('button', { name: '删除' }).click();
await page.getByText('1 / 2').waitFor({ timeout: 8000 });
console.log('deleted one page');

const undoBtn = page.getByRole('button', { name: '撤回到上一步' });
if (await undoBtn.isDisabled()) {
  throw new Error('undo should be enabled after deleting a page');
}
await undoBtn.hover();
await page.waitForTimeout(200);
const hist = await page.locator('.history-btns').boundingBox();
if (!hist) throw new Error('history buttons missing');
await page.screenshot({
  path: `${outDir}/undo_hover_tooltip.png`,
  clip: {
    x: Math.max(0, hist.x - 48),
    y: 0,
    width: Math.min(340, 1280 - Math.max(0, hist.x - 48)),
    height: 118
  }
});
console.log('undo tooltip ok');

await page.getByRole('button', { name: '旋转' }).click();
await page.waitForTimeout(400);
console.log('rotated');

await page.getByRole('button', { name: '添加' }).click();
await page.getByRole('button', { name: '＋ 空白页' }).click();
await page.getByRole('button', { name: '纵向（当前页面尺寸）' }).click();
await page.getByText('2 / 3').waitFor({ timeout: 8000 });
console.log('added blank page');

await page.getByRole('button', { name: '文字' }).click();
await page.getByPlaceholder('输入要加到这一页的文字').fill('本地导出测试');
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
if (await mobile.getByRole('button', { name: '打开示例 PDF' }).count()) {
  throw new Error('sample PDF button should be removed from mobile home');
}
await mobile.screenshot({ path: `${outDir}/home_mobile.png`, fullPage: true });
console.log('mobile home ok');

await mobile.getByRole('button', { name: '网页转 PDF' }).click();
await mobile.getByLabel('网址').waitFor();
const mobileBack = mobile.getByRole('button', { name: '返回', exact: true });
await assertNavInline(mobileBack, 'mobile web-to-pdf back');
await mobile.screenshot({ path: `${outDir}/web_to_pdf_mobile.png` });
console.log('web-to-pdf mobile form ok');

await browser.close();
console.log('e2e passed');
