import { useState } from 'react';
import { usePdfSession } from '../session/PdfSession';
import { NavBackLabel } from '../ui/NavBackLabel';
import { Toast } from '../ui/Toast';

export function WebToPdf() {
  const { goHome, openEditorFromFiles } = usePdfSession();
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 2400);
  }

  async function convert() {
    if (busy) return;
    const value = url.trim();
    if (!value) {
      showToast('请输入网址');
      return;
    }
    try {
      setBusy(true);
      const res = await fetch(new URL('api/web-to-pdf', window.location.href), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: value })
      });
      const type = res.headers.get('content-type') || '';
      if (!res.ok) {
        if (type.includes('application/json')) {
          const data = await res.json().catch(() => null);
          throw new Error(data?.error || '生成失败');
        }
        throw new Error('当前没有网页转 PDF 服务，请用 npm run dev 在本机启动');
      }
      if (!type.includes('application/pdf')) {
        throw new Error('返回的不是 PDF');
      }
      const bytes = await res.arrayBuffer();
      const header = res.headers.get('Content-Disposition') || '';
      const match = header.match(/filename="([^"]+)"/);
      const name = match?.[1] || '网页.pdf';
      const file = new File([bytes], name, { type: 'application/pdf' });
      await openEditorFromFiles([file]);
    } catch (error) {
      showToast(error instanceof Error ? error.message : '生成失败');
    } finally {
      setBusy(false);
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
        <p className="web-note">本机打开网页后生成 PDF，不会把文件传到别处。需要登录的页面可能转不全。</p>
      </div>
      <Toast message={toast} />
    </div>
  );
}
