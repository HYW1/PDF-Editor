import { access, mkdir, readFile, writeFile } from 'node:fs/promises';

const FONT_PATH = '/tmp/fonts/NotoSansSC-Regular.otf';
const FONT_URL =
  'https://cdn.jsdelivr.net/gh/googlefonts/noto-cjk@main/Sans/SubsetOTF/SC/NotoSansSC-Regular.otf';

let fontPromise = null;

export async function loadCjkFontBytes() {
  if (!fontPromise) {
    fontPromise = (async () => {
      await mkdir('/tmp/fonts', { recursive: true });
      try {
        await access(FONT_PATH);
        return readFile(FONT_PATH);
      } catch {
        /* download below */
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12000);
      try {
        const res = await fetch(FONT_URL, { signal: controller.signal });
        if (!res.ok) throw new Error(`font ${res.status}`);
        const bytes = Buffer.from(await res.arrayBuffer());
        await writeFile(FONT_PATH, bytes);
        return bytes;
      } finally {
        clearTimeout(timer);
      }
    })().catch((error) => {
      fontPromise = null;
      throw error;
    });
  }
  return fontPromise;
}
