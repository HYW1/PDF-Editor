import { useState, type DragEvent } from 'react';
import { pickFiles } from '../core/files';
import { usePdfSession } from '../session/PdfSession';
import { Toast } from '../ui/Toast';

export function Home() {
  const { openEditorFromFiles, openWebToPdf } = usePdfSession();
  const [toast, setToast] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 2200);
  }

  async function openPdfs(multiple: boolean) {
    try {
      const files = await pickFiles('application/pdf', multiple);
      if (!files.length) return;
      await openEditorFromFiles(files);
    } catch (error) {
      showToast(error instanceof Error ? error.message : '打开失败');
    }
  }

  async function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragOver(false);
    const files = Array.from(event.dataTransfer.files).filter(
      (file) => file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
    );
    if (!files.length) {
      showToast('请拖入 PDF 文件');
      return;
    }
    try {
      await openEditorFromFiles(files);
    } catch (error) {
      showToast(error instanceof Error ? error.message : '打开失败');
    }
  }

  return (
    <div className="home">
      <div className="home-inner">
        <header className="home-brand">
          <div className="home-logo">P</div>
          <h1 className="home-title">PDF小助手</h1>
          <p className="home-subtitle">简单的 PDF 操作，不用打开 WPS</p>
        </header>

        <div className="card-list">
          <button className="entry-card primary" onClick={() => openPdfs(false)}>
            <div className="entry-icon">✎</div>
            <div className="entry-body">
              <div className="entry-title">编辑 PDF</div>
              <div className="entry-desc">删除、排序、旋转页面，添加签名和文字</div>
            </div>
            <div className="entry-arrow">›</div>
          </button>

          <button className="entry-card" onClick={() => openPdfs(true)}>
            <div className="entry-icon">⊞</div>
            <div className="entry-body">
              <div className="entry-title">合并 PDF</div>
              <div className="entry-desc">选择多个 PDF，合并后继续调整页面</div>
            </div>
            <div className="entry-arrow">›</div>
          </button>

          <button className="entry-card disabled" onClick={openWebToPdf}>
            <div className="entry-icon">⊕</div>
            <div className="entry-body">
              <div className="entry-title">网页转 PDF</div>
              <div className="entry-desc">需要后端渲染服务，第二阶段实现</div>
              <span className="badge">第二阶段</span>
            </div>
            <div className="entry-arrow">›</div>
          </button>
        </div>

        <div
          className={`home-drop ${dragOver ? 'active' : ''}`}
          onDragOver={(event) => {
            event.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
        >
          也可以把 PDF 拖到这里打开
        </div>

        <p className="home-foot">
          电脑、手机浏览器都能用，文件只在本地处理
          <button
            className="text-btn"
            style={{ marginLeft: 8 }}
            onClick={async () => {
              try {
                const res = await fetch('/sample.pdf');
                const blob = await res.blob();
                const file = new File([blob], 'sample.pdf', { type: 'application/pdf' });
                await openEditorFromFiles([file]);
              } catch {
                showToast('示例文件加载失败');
              }
            }}
          >
            打开示例 PDF
          </button>
        </p>
      </div>
      <Toast message={toast} />
    </div>
  );
}
