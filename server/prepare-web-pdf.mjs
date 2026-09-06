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

export async function printPageToPdf(page, size) {
  try {
    await page.evaluate((compact) => {
      try {
        window.stop();
      } catch {
        /* ignore */
      }
      if (compact) {
        [...document.images].slice(16).forEach((img) => img.remove());
      }
    }, Boolean(process.env.VERCEL));
  } catch {
    /* page may already be idle */
  }
  const attempts = [pdfOptionsForWebPage(size), fallbackPdfOptions()];
  let lastError;
  for (const options of attempts) {
    try {
      const bytes = await page.pdf(options);
      if (bytes && bytes.byteLength > 200) return bytes;
      lastError = new Error('empty pdf');
    } catch (error) {
      lastError = error;
      console.warn('page.pdf failed', error);
    }
  }
  const detail = String(lastError?.message || lastError || 'empty pdf').replace(/\s+/g, ' ').slice(0, 70);
  const error = new Error(`网页打开了，但生成失败`);
  error.expose = true;
  console.error('printPageToPdf', detail);
  throw error;
}
