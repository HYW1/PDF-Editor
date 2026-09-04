import { chromium } from 'playwright';

export function parsePageUrl(raw) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return { error: '请输入网址' };
  let parsed;
  try {
    parsed = new URL(/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    return { error: '网址格式不对' };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { error: '只支持 http 或 https 网址' };
  }
  return { href: parsed.href, host: parsed.hostname || 'webpage' };
}

let browserPromise = null;

async function getBrowser() {
  if (!browserPromise) {
    browserPromise = chromium
      .launch({ channel: 'chrome', headless: true })
      .catch(() => chromium.launch({ headless: true }));
  }
  try {
    const browser = await browserPromise;
    if (!browser.isConnected()) throw new Error('closed');
    return browser;
  } catch {
    browserPromise = chromium
      .launch({ channel: 'chrome', headless: true })
      .catch(() => chromium.launch({ headless: true }));
    return browserPromise;
  }
}

export async function renderUrlToPdf(targetUrl, onProgress) {
  onProgress?.(12, '正在启动浏览器');
  const browser = await getBrowser();
  onProgress?.(22, '正在打开网页');
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
    locale: 'zh-CN'
  });
  try {
    let loaded = false;
    page.on('load', () => {
      loaded = true;
      onProgress?.(58, '网页已打开');
    });
    onProgress?.(32, '正在打开网页');
    await page.goto(targetUrl, { waitUntil: 'load', timeout: 25000 });
    if (!loaded) onProgress?.(62, '网页已打开');
    onProgress?.(74, '正在整理页面');
    await page.waitForTimeout(700);
    onProgress?.(86, '正在生成 PDF');
    const bytes = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '12mm', right: '12mm', bottom: '12mm', left: '12mm' }
    });
    onProgress?.(96, '即将完成');
    return bytes;
  } finally {
    await page.close().catch(() => {});
  }
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 8192) {
        reject(new Error('请求内容过大'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8') || '{}';
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('请求内容不对'));
      }
    });
    req.on('error', reject);
  });
}

export function webToPdfPlugin() {
  async function handle(req, res, next) {
    if (req.method !== 'POST') {
      res.statusCode = 405;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ error: '请用 POST 提交网址' }));
      return;
    }
    try {
      const body = await readJsonBody(req);
      const parsed = parsePageUrl(body.url);
      if (parsed.error) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ error: parsed.error }));
        return;
      }
      const name = `${parsed.host.replace(/[^\w.-]+/g, '_')}.pdf`;
      const wantsProgress = /ndjson|text\/event-stream/i.test(String(req.headers.accept || ''));
      if (wantsProgress) {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache');
        const send = (payload) => res.write(`${JSON.stringify(payload)}\n`);
        send({ type: 'progress', progress: 8, message: '正在准备' });
        try {
          const bytes = await renderUrlToPdf(parsed.href, (progress, message) => {
            send({ type: 'progress', progress, message });
          });
          send({ type: 'file', name, pdf: Buffer.from(bytes).toString('base64') });
          res.end();
        } catch (error) {
          console.error(error);
          const message = String(error?.message || error);
          const timeout = /timeout|timed out/i.test(message);
          send({ type: 'error', error: timeout ? '打开网页超时' : '打不开这个网页' });
          res.end();
        }
        return;
      }
      const bytes = await renderUrlToPdf(parsed.href);
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
      res.end(Buffer.from(bytes));
    } catch (error) {
      console.error(error);
      const message = String(error?.message || error);
      const timeout = /timeout|timed out/i.test(message);
      res.statusCode = timeout ? 504 : 502;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(
        JSON.stringify({
          error: timeout ? '打开网页超时' : '打不开这个网页'
        })
      );
    }
    void next;
  }

  return {
    name: 'web-to-pdf',
    configureServer(server) {
      server.middlewares.use('/api/web-to-pdf', handle);
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/web-to-pdf', handle);
    }
  };
}
