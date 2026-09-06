export const WEB_PDF_VIEWPORT = { width: 1280, height: 900, deviceScaleFactor: 1 };

export async function revealSiteContent(page) {
  await page.evaluate(async () => {
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    document.querySelectorAll('img[data-src], img[data-original]').forEach((img) => {
      const next = img.dataset.src || img.dataset.original;
      if (next && (!img.getAttribute('src') || img.src.startsWith('data:'))) img.src = next;
    });
    document.querySelectorAll('#js_content, .rich_media_content, #img-content').forEach((el) => {
      el.style.setProperty('visibility', 'visible', 'important');
      el.style.setProperty('display', 'block', 'important');
      el.style.setProperty('opacity', '1', 'important');
      el.style.setProperty('height', 'auto', 'important');
      el.style.setProperty('max-height', 'none', 'important');
    });
    document.querySelectorAll('#js_pc_qr_code, .qr_code_pc, #js_top_ad, .rich_media_area_extra').forEach((el) => {
      el.style.setProperty('display', 'none', 'important');
    });
    const expand = [...document.querySelectorAll('a, button, span')].find((el) =>
      /阅读全文|展开全文|查看全文|展开更多/.test(el.textContent || '')
    );
    expand?.click();
    await wait(200);
  });
}

export async function prepareWebPageForPdf(page) {
  await page.evaluate(async () => {
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    try {
      if (document.fonts?.ready) {
        await Promise.race([document.fonts.ready, wait(800)]);
      }
    } catch {
      /* ignore font timeouts */
    }

    for (const img of document.images) {
      img.loading = 'eager';
      if (img.dataset.src && !img.getAttribute('src')) img.src = img.dataset.src;
      if (img.dataset.original && !img.getAttribute('src')) img.src = img.dataset.original;
    }

    const style = document.createElement('style');
    style.setAttribute('data-pdf-helper', 'prepare');
    style.textContent = `
      html, body {
        height: auto !important;
        max-height: none !important;
        overflow: visible !important;
      }
      img, video, canvas, svg { max-width: 100% !important; height: auto !important; }
      @page { margin: 0; }
    `;
    document.head.appendChild(style);

    const unclip = (el) => {
      if (!el) return;
      const cs = getComputedStyle(el);
      const clipped =
        cs.overflow === 'hidden' ||
        cs.overflowY === 'hidden' ||
        cs.overflowY === 'auto' ||
        cs.overflowY === 'scroll';
      if (clipped && el.scrollHeight > el.clientHeight + 20) {
        el.style.setProperty('overflow', 'visible', 'important');
        el.style.setProperty('height', 'auto', 'important');
        el.style.setProperty('max-height', 'none', 'important');
      }
    };
    unclip(document.documentElement);
    unclip(document.body);
    document.querySelectorAll('main, #__next, #app, #root, .app').forEach(unclip);

    const limit = Math.min(
      Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight || 0, 900),
      14000
    );
    const step = Math.max(window.innerHeight * 0.95, 800);
    for (let y = 0; y < limit; y += step) {
      window.scrollTo(0, y);
      await wait(40);
    }
    window.scrollTo(0, 0);
    await wait(120);

    await Promise.all(
      [...document.images].slice(0, 40).map((img) => {
        if (img.complete) return undefined;
        return new Promise((resolve) => {
          const done = () => resolve();
          img.addEventListener('load', done, { once: true });
          img.addEventListener('error', done, { once: true });
          setTimeout(done, 800);
        });
      })
    );
  });
}

export async function measureWebPageSize(page) {
  return page.evaluate(() => {
    const html = document.documentElement;
    const body = document.body;
    return {
      width: Math.max(html.scrollWidth, body?.scrollWidth || 0, html.clientWidth, 1280),
      height: Math.max(html.scrollHeight, body?.scrollHeight || 0, html.clientHeight, 900)
    };
  });
}

export function pdfOptionsForWebPage(size = {}) {
  const compact = Boolean(process.env.VERCEL);
  const width = Math.min(Math.max(Math.round(size.width || 1280), 390), compact ? 900 : 1100);
  const pageHeight = Math.round((width * 297) / 210);
  return {
    width: `${width}px`,
    height: `${pageHeight}px`,
    printBackground: true,
    preferCSSPageSize: false,
    scale: compact ? 0.58 : 0.72,
    waitForFonts: false,
    tagged: false,
    outline: false,
    margin: { top: '0', right: '0', bottom: '0', left: '0' }
  };
}

export function fallbackPdfOptions() {
  return {
    format: 'A4',
    printBackground: true,
    preferCSSPageSize: false,
    scale: 0.68,
    waitForFonts: false,
    tagged: false,
    outline: false,
    margin: { top: '10px', right: '10px', bottom: '10px', left: '10px' }
  };
}

function paperInches(options) {
  if (options.format === 'A4') return { paperWidth: 8.27, paperHeight: 11.69 };
  return {
    paperWidth: (parseFloat(options.width) || 900) / 96,
    paperHeight: (parseFloat(options.height) || 1273) / 96
  };
}

async function printWithCdp(page, options) {
  if (typeof page.createCDPSession !== 'function') return null;
  const session = await page.createCDPSession();
  try {
    const paper = paperInches(options);
    const result = await session.send('Page.printToPDF', {
      printBackground: true,
      paperWidth: paper.paperWidth,
      paperHeight: paper.paperHeight,
      scale: options.scale || 1,
      preferCSSPageSize: false,
      generateTaggedPDF: false,
      generateDocumentOutline: false
    });
    if (!result?.data) throw new Error('cdp pdf empty');
    return Buffer.from(result.data, 'base64');
  } finally {
    await session.detach().catch(() => {});
  }
}

export async function screenshotPageToPdf(page, size) {
  const { PDFDocument } = await import('pdf-lib');
  const width = Math.min(Math.max(Math.round(size.width || 1280), 390), 1100);
  let totalHeight = Math.min(Math.max(Math.round(size.height || 900), 900), 14000);
  try {
    const measured = await page.evaluate(() => ({
      width: Math.min(Math.max(document.documentElement.scrollWidth || 1280, 390), 1280),
      height: Math.min(Math.max(document.documentElement.scrollHeight || 900, 900), 14000)
    }));
    totalHeight = measured.height;
  } catch {
    /* keep measured size from caller */
  }
  const slice = 1400;
  if (typeof page.setViewportSize === 'function') {
    await page.setViewportSize({ width, height: slice }).catch(() => {});
  } else if (typeof page.setViewport === 'function') {
    await page.setViewport({ width, height: slice, deviceScaleFactor: 1 }).catch(() => {});
  }
  const doc = await PDFDocument.create();
  for (let y = 0; y < totalHeight; y += slice) {
    try {
      await page.evaluate((top) => window.scrollTo(0, top), y);
      await new Promise((resolve) => setTimeout(resolve, 50));
    } catch {
      /* keep going */
    }
    const bytes = await page.screenshot({ type: 'jpeg', quality: 68, fullPage: false });
    const image = await doc.embedJpg(bytes);
    const paper = doc.addPage([image.width, image.height]);
    paper.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
  }
  const out = await doc.save({ useObjectStreams: true });
  if (out.byteLength < 400) throw new Error('empty screenshot pdf');
  return Buffer.from(out);
}

export async function printPageToPdf(page, size) {
  try {
    await page.evaluate(() => {
      try {
        window.stop();
      } catch {
        /* ignore */
      }
    });
  } catch {
    /* page may already be idle */
  }
  const attempts = [pdfOptionsForWebPage(size), fallbackPdfOptions()];
  let lastError;
  for (const options of attempts) {
    try {
      const viaCdp = await printWithCdp(page, options);
      if (viaCdp && viaCdp.byteLength > 200) return viaCdp;
    } catch (error) {
      lastError = error;
      console.warn('cdp pdf failed', error);
    }
    try {
      const bytes = await page.pdf(options);
      if (bytes && bytes.byteLength > 200) return bytes;
      lastError = new Error('empty pdf');
    } catch (error) {
      lastError = error;
      console.warn('page.pdf failed', error);
    }
  }
  const detail = String(lastError?.message || lastError || 'empty pdf').replace(/\s+/g, ' ').slice(0, 80);
  const error = new Error(`网页打开了，但生成失败：${detail}`);
  error.expose = true;
  console.error('printPageToPdf', detail);
  throw error;
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"]/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;'
  })[char]);
}

export function articleFallbackHtml(title, text) {
  const safeTitle = escapeHtml(title || '网页');
  const safeText = escapeHtml(text || '');
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${safeTitle}</title>
<style>
  body { font: 16px/1.65 -apple-system, BlinkMacSystemFont, 'Noto Sans SC', 'PingFang SC', sans-serif; margin: 28px; color: #111; }
  h1 { font-size: 22px; line-height: 1.4; margin: 0 0 16px; }
  p { white-space: pre-wrap; margin: 0; }
</style></head>
<body><h1>${safeTitle}</h1><p>${safeText}</p></body></html>`;
}

export async function textToPdfBytes(title, text) {
  const { PDFDocument, rgb } = await import('pdf-lib');
  const fontkit = (await import('@pdf-lib/fontkit')).default;
  const { loadCjkFontBytes } = await import('./cjk-font.mjs');
  const fontBytes = await loadCjkFontBytes();
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(fontBytes, { subset: true });
  const pageWidth = 595;
  const pageHeight = 842;
  const margin = 48;
  const titleSize = 18;
  const bodySize = 12;
  const lineHeight = 18;
  const maxWidth = pageWidth - margin * 2;
  const wrap = (value, size) => {
    const lines = [];
    for (const paragraph of String(value || '').split('\n')) {
      let current = '';
      for (const char of paragraph) {
        const next = current + char;
        if (current && font.widthOfTextAtSize(next, size) > maxWidth) {
          lines.push(current);
          current = char;
        } else {
          current = next;
        }
      }
      lines.push(current);
    }
    return lines;
  };
  let page = doc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;
  const drawLines = (lines, size) => {
    for (const line of lines) {
      if (y < margin + lineHeight) {
        page = doc.addPage([pageWidth, pageHeight]);
        y = pageHeight - margin;
      }
      if (line) {
        page.drawText(line, { x: margin, y, size, font, color: rgb(0.1, 0.1, 0.1) });
      }
      y -= lineHeight;
    }
  };
  drawLines(wrap(title || '网页', titleSize), titleSize);
  y -= 10;
  drawLines(wrap(text, bodySize), bodySize);
  return Buffer.from(await doc.save({ useObjectStreams: true }));
}

export async function printOpenedPage(page, opened, onProgress) {
  const compact = String(opened.text || '').replace(/\s+/g, '');
  const visualAttempts = process.env.VERCEL
    ? [screenshotPageToPdf, printPageToPdf]
    : [printPageToPdf, screenshotPageToPdf];
  onProgress?.(86, '正在生成 PDF');
  for (const attempt of visualAttempts) {
    try {
      const bytes = await attempt(page, opened.size);
      if (bytes && bytes.byteLength > 800) {
        onProgress?.(96, '即将完成');
        return { bytes, name: opened.name };
      }
    } catch (error) {
      console.warn('visual capture failed', error);
    }
  }
  if (compact.length < 20) throw Object.assign(new Error('网页打开了，但生成失败'), { expose: true });
  onProgress?.(90, '正在保存文字内容');
  const bytes = await textToPdfBytes(opened.title || opened.name, opened.text);
  onProgress?.(96, '即将完成');
  return { bytes, name: opened.name };
}
