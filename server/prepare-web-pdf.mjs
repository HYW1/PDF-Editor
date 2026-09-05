export const WEB_PDF_VIEWPORT = { width: 1280, height: 900, deviceScaleFactor: 1 };

export async function prepareWebPageForPdf(page) {
  await page.evaluate(async () => {
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    try {
      if (document.fonts?.ready) {
        await Promise.race([document.fonts.ready, wait(2500)]);
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
      20000
    );
    const step = Math.max(window.innerHeight * 0.8, 640);
    for (let y = 0; y < limit; y += step) {
      window.scrollTo(0, y);
      await wait(80);
    }
    window.scrollTo(0, 0);
    await wait(200);

    await Promise.all(
      [...document.images].map((img) => {
        if (img.complete) return undefined;
        return new Promise((resolve) => {
          const done = () => resolve();
          img.addEventListener('load', done, { once: true });
          img.addEventListener('error', done, { once: true });
          setTimeout(done, 2000);
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
  const width = Math.min(Math.max(Math.round(size.width || 1280), 1024), 1600);
  const pageHeight = Math.round((width * 297) / 210);
  return {
    width: `${width}px`,
    height: `${pageHeight}px`,
    printBackground: true,
    preferCSSPageSize: false,
    margin: { top: '0', right: '0', bottom: '0', left: '0' }
  };
}
