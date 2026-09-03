import { usePdfSession } from '../session/PdfSession';

export function WebToPdf() {
  const { goHome } = usePdfSession();

  return (
    <div className="subpage">
      <div className="topbar">
        <button className="nav-btn" onClick={goHome}>
          返回
        </button>
        <div className="file-name">网页转 PDF</div>
        <span />
      </div>
      <div className="coming">
        <h2>这个功能还没有实现</h2>
        <p>
          微信小程序和浏览器前端都无法完整渲染任意网页。第二阶段会做成：
        </p>
        <p>
          前端提交网址 → 后端 API → Playwright / Chromium 打开网页 → 生成 PDF → 返回文件。
        </p>
        <p>
          现在不会假装已经能转。需要一台能跑 Chromium 的服务器后，再接
          <code>/api/web-to-pdf</code>。
        </p>
        <button className="primary-btn" onClick={goHome}>
          回到首页
        </button>
      </div>
    </div>
  );
}
