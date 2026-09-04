import { usePdfSession } from '../session/PdfSession';
import { NavBackLabel } from '../ui/NavBackLabel';

export function WebToPdf() {
  const { goHome } = usePdfSession();

  return (
    <div className="subpage">
      <div className="topbar">
        <button className="nav-btn" onClick={goHome}>
          <NavBackLabel>返回</NavBackLabel>
        </button>
        <div className="file-name">网页转 PDF</div>
        <span />
      </div>
      <div className="coming">
        <h2>这个功能还在准备</h2>
        <p>浏览器里没法完整打开任意网页，所以现在还做不了。</p>
        <p>以后会做成：提交网址，由服务器生成 PDF。</p>
        <button className="primary-btn" onClick={goHome}>
          返回首页
        </button>
      </div>
    </div>
  );
}
