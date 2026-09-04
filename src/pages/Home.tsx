import { useState, type DragEvent } from 'react';
import { pickFiles } from '../core/files';
import { usePdfSession } from '../session/PdfSession';
import { IconChevron, IconCloud, IconDocPlus, IconEdit, IconFile, IconMerge, IconWeb } from '../ui/icons';
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

  async function openSample() {
    try {
      const res = await fetch('./sample.pdf');
      const blob = await res.blob();
      const file = new File([blob], 'sample.pdf', { type: 'application/pdf' });
      await openEditorFromFiles([file]);
    } catch {
      showToast('示例文件加载失败');
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
        <div className="home-bar">
          <div className="brand">
            <span className="brand-mark">
              <IconFile size={16} />
            </span>
            <span className="kicker">轻量工具</span>
          </div>
          <button className="sample-link" onClick={openSample}>
            <IconFile size={16} />
            打开示例 PDF
          </button>
        </div>

        <header className="home-heading">
          <h1 className="home-title">PDF小助手</h1>
          <p className="home-subtitle">简单的 PDF 操作，不用打开 WPS。文件只在这台设备上处理。</p>
        </header>

        <div className="home-features">
          <button className="hero" onClick={() => openPdfs(false)}>
            <div className="hero-icon">
              <IconEdit size={24} />
            </div>
            <div className="hero-copy">
              <div className="hero-title">编辑 PDF</div>
              <div className="hero-desc">删除、排序、旋转，加上签名和文字，然后导出一份新文件。</div>
            </div>
            <span className="row-chevron">
              <IconChevron size={18} />
            </span>
          </button>

          <div className="more-block">
            <div className="section-label">更多操作</div>
            <div className="more-grid">
              <button className="action-row" onClick={() => openPdfs(true)}>
                <div className="tool-card-icon">
                  <IconMerge size={20} />
                </div>
                <div className="action-body">
                  <div className="tool-card-title">合并 PDF</div>
                  <div className="tool-card-desc">选多个文件，合成后再调整页序</div>
                </div>
                <span className="row-chevron">
                  <IconChevron size={18} />
                </span>
              </button>

              <button className="action-row dim" onClick={openWebToPdf}>
                <div className="tool-card-icon">
                  <IconWeb size={20} />
                </div>
                <div className="action-body">
                  <div className="tool-card-title">网页转 PDF</div>
                  <div className="tool-card-desc">需要后端渲染，第二阶段再做</div>
                  <span className="badge">第二阶段</span>
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
          <span className="drop-icon mobile-only">
            <IconDocPlus size={28} />
          </span>
          <span className="drop-icon desktop-only">
            <IconCloud size={28} />
          </span>
          <div>电脑上也可以把 PDF 拖到这里打开</div>
        </div>

        <p className="home-foot">手机点选文件，电脑支持拖拽。导出前不会上传到服务器。</p>
      </div>
      <Toast message={toast} />
    </div>
  );
}
