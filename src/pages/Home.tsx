import { useState, type DragEvent } from 'react';
import { pickFiles } from '../core/files';
import { usePdfSession } from '../session/PdfSession';
import { IconChevron, IconDocPlus, IconEdit, IconMerge, IconWeb } from '../ui/icons';
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
        <header className="home-heading">
          <div className="brand">
            <span className="brand-mark">
              <img src="/logo.png" width={48} height={48} alt="" />
            </span>
            <h1 className="home-title">PDF小助手</h1>
          </div>
          <p className="home-subtitle">打开就能改，文件不会离开这台设备。</p>
        </header>

        <div className="home-features">
          <button className="hero" onClick={() => openPdfs(false)}>
            <div className="feature-icon">
              <IconEdit size={24} />
            </div>
            <div className="hero-copy">
              <div className="hero-title">编辑 PDF</div>
              <div className="hero-desc">删页、调序、旋转，加上签名和文字后导出。</div>
            </div>
            <span className="row-chevron">
              <IconChevron size={18} />
            </span>
          </button>

          <div className="more-block">
            <div className="section-label">更多操作</div>
            <div className="more-grid">
              <button className="action-row" onClick={() => openPdfs(true)}>
                <div className="feature-icon">
                  <IconMerge size={24} />
                </div>
                <div className="action-body">
                  <div className="tool-card-title">合并 PDF</div>
                  <div className="tool-card-desc">把多个文件合成一份，再调整页序。</div>
                </div>
                <span className="row-chevron">
                  <IconChevron size={18} />
                </span>
              </button>

              <button className="action-row dim" onClick={openWebToPdf}>
                <div className="feature-icon">
                  <IconWeb size={24} />
                </div>
                <div className="action-body">
                  <div className="tool-card-title">网页转 PDF</div>
                  <div className="tool-card-desc">把网页保存成 PDF。</div>
                  <span className="badge">即将推出</span>
                </div>
                <span className="row-chevron">
                  <IconChevron size={18} />
                </span>
              </button>
            </div>
          </div>
        </div>

        <div
          className={`home-drop ${dragOver ? 'active' : ''}`}
          onClick={() => openPdfs(false)}
          onDragOver={(event) => {
            event.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
        >
          <span className="drop-icon">
            <IconDocPlus size={32} />
          </span>
          <div className="drop-copy mobile-only">点这里选择 PDF</div>
          <div className="drop-copy desktop-only">把 PDF 拖到这里，也可以点这里选择</div>
        </div>

        <p className="home-foot">文件只在这台设备上处理，不会上传。</p>
      </div>
      <Toast message={toast} />
    </div>
  );
}
