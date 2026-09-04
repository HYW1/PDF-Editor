import { parsePageUrl } from './parse-page-url.mjs';

function readJsonBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    return Promise.resolve(req.body);
  }
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

export function createWebToPdfHandler(renderUrlToPdf) {
  return async function handle(req, res) {
    if (req.method !== 'POST') {
      res.statusCode = 405;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ error: '请用 POST 提交网址' }));
      return;
    }
    try {
      const body = await readJsonBody(req);
      const parsed = parsePageUrl(body.url, { allowPrivate: !process.env.VERCEL });
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
  };
}
