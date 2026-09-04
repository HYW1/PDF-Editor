import { useEffect, useRef, useState } from 'react';
import { usePdfSession } from '../session/PdfSession';
import { NavBackLabel } from '../ui/NavBackLabel';
import { Toast } from '../ui/Toast';

function etaText(progress: number, startedAt: number): string {
  if (progress < 10) return '开始了';
  const elapsed = Date.now() - startedAt;
  const remaining = elapsed * ((100 - progress) / Math.max(progress, 1));
  if (remaining < 3500) return '马上好';
  if (remaining < 12000) return '大约还要十几秒';
  if (remaining < 28000) return '大约还要半分钟';
  return '页面比较慢，请再等一会儿';
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function WebToPdf() {
  const { goHome, openEditorFromFiles } = usePdfSession();
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState('正在准备');
  const [eta, setEta] = useState('开始了');
  const [toast, setToast] = useState<string | null>(null);
  const startedAt = useRef(0);
  const progressRef = useRef(0);

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 2400);
  }

  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);

  useEffect(() => {
    if (!busy) return;
    const timer = window.setInterval(() => {
      setProgress((value) => (value > 0 && value < 62 ? Math.min(62, value + 1) : value));
      setEta(etaText(Math.max(progressRef.current, 8), startedAt.current));
    }, 450);
    return () => window.clearInterval(timer);
  }, [busy]);

  async function convert() {
    if (busy) return;
    const value = url.trim();
    if (!value) {
      showToast('请输入网址');
      return;
    }
    startedAt.current = Date.now();
    setBusy(true);
    setProgress(6);
    setProgressText('正在准备');
    setEta('开始了');
    try {
      const res = await fetch(new URL('api/web-to-pdf', window.location.href), {
        method: 'POST',
        headers: {
          Accept: 'application/x-ndjson',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ url: value })
      });
      const type = res.headers.get('content-type') || '';
      if (!res.ok && !type.includes('ndjson')) {
        if (type.includes('application/json')) {
          const data = await res.json().catch(() => null);
          throw new Error(data?.error || '生成失败');
        }
        throw new Error('当前没有网页转 PDF 服务，请用 npm run dev 在本机启动');
      }
      if (type.includes('application/pdf')) {
        setProgress(92);
        setProgressText('正在打开编辑器');
        const bytes = await res.arrayBuffer();
        const header = res.headers.get('Content-Disposition') || '';
        const match = header.match(/filename="([^"]+)"/);
        const name = match?.[1] || '网页.pdf';
        await openEditorFromFiles([new File([bytes], name, { type: 'application/pdf' })]);
        return;
      }
      if (!res.body) throw new Error('生成失败');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fileName = '网页.pdf';
      let fileBytes: Uint8Array | null = null;
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as {
            type?: string;
            progress?: number;
            message?: string;
            error?: string;
            name?: string;
            pdf?: string;
          };
          if (event.type === 'progress') {
            setProgress((current) => Math.max(current, event.progress || current));
            if (event.message) setProgressText(event.message);
            setEta(etaText(event.progress || progress, startedAt.current));
          } else if (event.type === 'error') {
            throw new Error(event.error || '生成失败');
          } else if (event.type === 'file' && event.pdf) {
            fileName = event.name || fileName;
            fileBytes = base64ToBytes(event.pdf);
          }
        }
      }
      if (!fileBytes) throw new Error('返回的不是 PDF');
      setProgress(100);
      setProgressText('正在打开编辑器');
      const copy = new Uint8Array(fileBytes.byteLength);
      copy.set(fileBytes);
      await openEditorFromFiles([new File([copy], fileName, { type: 'application/pdf' })]);
    } catch (error) {
      showToast(error instanceof Error ? error.message : '生成失败');
    } finally {
      setBusy(false);
      setProgress(0);
    }
  }

  return (
    <div className="subpage">
      <div className="topbar">
        <button className="nav-btn" onClick={goHome}>
          <NavBackLabel>返回</NavBackLabel>
        </button>
        <div className="file-name">网页转 PDF</div>
        <span />
      </div>
      <div className="web-form">
        <label className="web-label" htmlFor="web-url">
          网址
        </label>
        <input
          id="web-url"
          className="web-input"
          type="url"
          inputMode="url"
          autoCapitalize="off"
          autoCorrect="off"
          placeholder="https://example.com"
          value={url}
          disabled={busy}
          onChange={(event) => setUrl(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void convert();
          }}
        />
        <button className="primary-btn web-submit" onClick={() => void convert()} disabled={busy}>
          {busy ? '正在生成…' : '生成 PDF'}
        </button>
        {busy && (
          <div className="web-progress" aria-live="polite">
            <div className="web-progress-track">
              <div className="web-progress-bar" style={{ width: `${Math.min(100, progress)}%` }} />
            </div>
            <div className="web-progress-copy">
              <span>
                {progressText} {Math.min(99, Math.max(1, Math.round(progress)))}%
              </span>
              <span className="web-progress-eta">{eta}</span>
            </div>
          </div>
        )}
        <p className="web-note">本机打开网页后生成 PDF，不会把文件传到别处。需要登录的页面可能转不全。</p>
      </div>
      <Toast message={toast} />
    </div>
  );
}
