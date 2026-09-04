import { useState, type DragEvent } from 'react';
import { pickFiles } from '../core/files';
import { loadPdfFile } from '../core/pdf-engine';
import { downloadPageImages, renderPagesToPngs } from '../core/pdf-to-images';
import { usePdfSession } from '../session/PdfSession';
import { IconChevron, IconEdit, IconImage, IconMerge, IconPdfToImage, IconWeb } from '../ui/icons';
import { Toast } from '../ui/Toast';

const TIP_AMOUNTS = [2, 3, 5, 6.6, 8.8, 16.8];
const IMAGE_ACCEPT = 'image/png,image/jpeg,image/jpg,image/webp,image/bmp,image/gif';

function randomTipAmount() {
  return String(TIP_AMOUNTS[Math.floor(Math.random() * TIP_AMOUNTS.length)]);
}

function isPdf(file: File) {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

function isImage(file: File) {
  if (file.type.startsWith('image/')) return true;
  return /\.(png|jpe?g|webp|bmp|gif)$/i.test(file.name);
}

export function Home() {
  const { openEditorFromFiles, openEditorFromImages, openWebToPdf } = usePdfSession();
  const [toast, setToast] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [tipOpen, setTipOpen] = useState(false);
  const [tipAmount, setTipAmount] = useState('5');
  const [busy, setBusy] = useState(false);

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

  async function openImages() {
    try {
      const files = await pickFiles(IMAGE_ACCEPT, true);
      if (!files.length) return;
      await openEditorFromImages(files);
    } catch (error) {
      showToast(error instanceof Error ? error.message : '打开失败');
    }
  }

  async function convertPdfToImages() {
    if (busy) return;
    try {
      const files = await pickFiles('application/pdf', false);
      if (!files[0]) return;
      setBusy(true);
      showToast('正在导出图片…');
      const loaded = await loadPdfFile(files[0]);
      const images = await renderPagesToPngs(
        loaded.pages,
        { [loaded.doc.id]: loaded.doc },
        [],
        (done, total) => showToast(`导出图片 ${done}/${total}`)
      );
      downloadPageImages(images, files[0].name);
      showToast(images.length === 1 ? '已导出图片' : `已导出 ${images.length} 张图片`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : '导出图片失败');
    } finally {
      setBusy(false);
    }
  }

  async function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragOver(false);
    const incoming = Array.from(event.dataTransfer.files);
    const pdfs = incoming.filter(isPdf);
    const images = incoming.filter((file) => !isPdf(file) && isImage(file));
    try {
      if (pdfs.length && images.length) {
        showToast('请一次只拖入 PDF 或图片');
        return;
      }
      if (pdfs.length) {
        await openEditorFromFiles(pdfs);
        return;
      }
      if (images.length) {
        await openEditorFromImages(images);
        return;
      }
      showToast('请拖入 PDF 或图片');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '打开失败');
    }
  }

  return (
    <div
      className={`home ${dragOver ? 'drag-over' : ''}`}
      onDragOver={(event) => {
        event.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node)) return;
        setDragOver(false);
      }}
      onDrop={onDrop}
    >
      <div className="home-inner">
        <header className="home-heading">
          <div className="brand">
            <span className="brand-mark">
              <img src="/logo.png" width={48} height={48} alt="" />
            </span>
            <h1 className="home-title">PDF小助手</h1>
          </div>
        </header>

        <div className="home-features">
          <div className="home-primary">
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

            <button className="action-row" onClick={openWebToPdf}>
              <div className="feature-icon">
                <IconWeb size={24} />
              </div>
              <div className="action-body">
                <div className="tool-card-title">网页转 PDF</div>
                <div className="tool-card-desc">把网页保存成 PDF。</div>
              </div>
              <span className="row-chevron">
                <IconChevron size={18} />
              </span>
            </button>
          </div>

          <div className="convert-block">
            <div className="section-label">格式转换</div>
            <div className="convert-grid">
              <button className="action-row" onClick={() => void openImages()}>
                <div className="feature-icon">
                  <IconImage size={24} />
                </div>
                <div className="action-body">
                  <div className="tool-card-title">图片转 PDF</div>
                  <div className="tool-card-desc">把照片做成一页一页的 PDF。</div>
                </div>
                <span className="row-chevron">
                  <IconChevron size={18} />
                </span>
              </button>

              <button className="action-row" onClick={() => void convertPdfToImages()} disabled={busy}>
                <div className="feature-icon">
                  <IconPdfToImage size={24} />
                </div>
                <div className="action-body">
                  <div className="tool-card-title">PDF 转图片</div>
                  <div className="tool-card-desc">把每一页存成 PNG 图片。</div>
                </div>
                <span className="row-chevron">
                  <IconChevron size={18} />
                </span>
              </button>
            </div>
          </div>
        </div>

        <div className="home-foot-block">
          <p className="home-foot">功能都免费。文件不上传，改完再导出。</p>
          <button
            className="home-tip"
            onClick={() => {
              setTipAmount(randomTipAmount());
              setTipOpen(true);
            }}
          >
            随机打赏
          </button>
        </div>
      </div>
      {tipOpen && (
        <>
          <div className="sheet-mask" onClick={() => setTipOpen(false)} />
          <div className="sheet">
            <div className="sheet-grabber" />
            <h3>随机打赏</h3>
            <p className="sheet-note tip-copy">功能都免费，完全自愿。金额可以改，也可以用手输。</p>
            <div className="tip-amount-wrap">
              <span className="tip-currency">¥</span>
              <input
                id="tip-amount"
                className="tip-input"
                inputMode="decimal"
                autoComplete="off"
                aria-label="打赏金额"
                value={tipAmount}
                onChange={(event) => {
                  const next = event.target.value.replace(/[^\d.]/g, '');
                  const parts = next.split('.');
                  setTipAmount(parts.length > 2 ? `${parts[0]}.${parts.slice(1).join('')}` : next);
                }}
              />
            </div>
            <div className="tip-presets">
              {TIP_AMOUNTS.map((amount) => (
                <button
                  key={amount}
                  type="button"
                  className={`tip-preset ${tipAmount === String(amount) ? 'active' : ''}`}
                  onClick={() => setTipAmount(String(amount))}
                >
                  ¥{amount}
                </button>
              ))}
            </div>
            <p className="sheet-note tip-copy">收款码还没放上来，先记下这份心意。</p>
            <button className="sheet-cancel" onClick={() => setTipOpen(false)}>
              关闭
            </button>
          </div>
        </>
      )}
      <Toast message={toast} />
    </div>
  );
}
