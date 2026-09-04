import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { compressPdfBytes, type ExportQuality } from '../core/pdf-compress';
import { estimateExportSizes, formatEstimate } from '../core/pdf-estimate';
import { downloadBytes, pickFiles } from '../core/files';
import { exportPdf } from '../core/pdf-engine';
import { downloadPageImages, renderPagesToPngs } from '../core/pdf-to-images';
import { AD_SECONDS, compressNeedsAd, formatSize, recordExport, unlockWithAd } from '../core/quota';
import type { Annotation, FitMode } from '../core/types';
import { usePdfSession } from '../session/PdfSession';
import { IconTip } from '../ui/IconTip';
import { NavBackLabel } from '../ui/NavBackLabel';
import {
  IconBlank,
  IconFile,
  IconImage,
  IconPlus,
  IconRedo,
  IconRotate,
  IconSign,
  IconText,
  IconTrash,
  IconUndo
} from '../ui/icons';
import { PageCanvas } from '../ui/PageCanvas';
import { Toast } from '../ui/Toast';
import { useIsDesktop } from '../ui/useMedia';

type Sheet = 'add' | 'fit' | 'blank' | 'text' | 'export' | 'ad' | null;

export function Editor() {
  const session = usePdfSession();
  const {
    fileName,
    pages,
    docs,
    annotations,
    currentPageIndex,
    currentPage,
    selectedAnnotationId,
    canUndo,
    canRedo
  } = session;
  const [sheet, setSheet] = useState<Sheet>(null);
  const [textValue, setTextValue] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [pendingQuality, setPendingQuality] = useState<Exclude<ExportQuality, 'original'> | null>(null);
  const [adLeft, setAdLeft] = useState(AD_SECONDS);
  const stageRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const [previewWidth, setPreviewWidth] = useState(280);
  const isDesktop = useIsDesktop();
  const swipe = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const el = previewRef.current;
    if (!el) return;
    const update = () => {
      const ratio = currentPage ? currentPage.height / currentPage.width : 1.414;
      const availW = Math.max(160, el.clientWidth - 24);
      const availH = Math.max(160, el.clientHeight - 24);
      const widthFromHeight = availH / ratio;
      setPreviewWidth(Math.floor(Math.min(availW, widthFromHeight, 620)));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [currentPage]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'z') {
        event.preventDefault();
        if (event.shiftKey) session.redo();
        else session.undo();
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        if (selectedAnnotationId) session.deleteAnnotation(selectedAnnotationId);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedAnnotationId, session]);

  const pageAnns = useMemo(
    () => annotations.filter((item) => currentPage && item.pageId === currentPage.id),
    [annotations, currentPage]
  );

  const exportSizes = useMemo(
    () => estimateExportSizes(pages, docs, annotations),
    [annotations, docs, pages]
  );

  useEffect(() => {
    if (sheet !== 'ad') return;
    setAdLeft(AD_SECONDS);
    const timer = window.setInterval(() => {
      setAdLeft((left) => {
        if (left <= 1) {
          window.clearInterval(timer);
          return 0;
        }
        return left - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [sheet]);

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 2200);
  }

  async function onAddImage() {
    setSheet(null);
    const files = await pickFiles('image/png,image/jpeg,image/jpg,image/webp,image/bmp,image/gif', true);
    if (!files.length) return;
    setSheet('fit');
    pendingImages.current = files;
  }

  const pendingImages = useRef<File[]>([]);

  async function confirmFit(fit: FitMode) {
    setSheet(null);
    try {
      await session.addImagePages(pendingImages.current, fit);
    } catch (error) {
      showToast(error instanceof Error ? error.message : '添加图片失败');
    }
  }

  async function onAddPdf() {
    setSheet(null);
    const files = await pickFiles('application/pdf', false);
    if (!files[0]) return;
    try {
      await session.startAddPdf(files[0]);
    } catch (error) {
      showToast(error instanceof Error ? error.message : '添加 PDF 失败');
    }
  }

  async function onExport() {
    if (!pages.length || exporting) return;
    setSheet('export');
  }

  function startCompress(quality: Exclude<ExportQuality, 'original'>) {
    if (!pages.length || exporting) return;
    if (compressNeedsAd()) {
      setPendingQuality(quality);
      setSheet('ad');
      return;
    }
    void confirmExport(quality);
  }

  async function confirmExport(quality: ExportQuality) {
    if (!pages.length || exporting) return;
    setSheet(null);
    try {
      setExporting(true);
      showToast(quality === 'original' ? '正在导出…' : '正在压缩…');
      let bytes = await exportPdf(pages, docs, annotations);
      if (quality !== 'original') {
        unlockWithAd();
        bytes = await compressPdfBytes(bytes, quality, (done, total) => {
          showToast(`压缩中 ${done}/${total}`);
        });
      }
      recordExport();
      const suffix = quality === 'original' ? '_编辑.pdf' : `_压缩${quality === 'high' ? '高' : quality === 'medium' ? '中' : '低'}.pdf`;
      const name = fileName.replace(/\.pdf$/i, '') + suffix;
      downloadBytes(bytes, name);
      showToast('已导出新的 PDF');
    } catch (error) {
      console.error(error);
      showToast(error instanceof Error ? error.message : '导出失败');
    } finally {
      setExporting(false);
      setPendingQuality(null);
    }
  }

  async function exportAsImages() {
    if (!pages.length || exporting) return;
    setSheet(null);
    try {
      setExporting(true);
      showToast('正在导出图片…');
      const images = await renderPagesToPngs(pages, docs, annotations, (done, total) => {
        showToast(`导出图片 ${done}/${total}`);
      });
      downloadPageImages(images, fileName);
      showToast(images.length === 1 ? '已导出图片' : `已导出 ${images.length} 张图片`);
    } catch (error) {
      console.error(error);
      showToast(error instanceof Error ? error.message : '导出图片失败');
    } finally {
      setExporting(false);
    }
  }

  function onDeletePage() {
    if (pages.length <= 1) {
      showToast('至少保留一页');
      return;
    }
    session.deleteCurrentPage();
  }

  return (
    <div className="editor">
      <div className="topbar">
        <div className="topbar-left">
          <button className="nav-btn" onClick={session.goHome}>
            <NavBackLabel>返回</NavBackLabel>
          </button>
          <div className="file-name">{fileName}</div>
        </div>
        <div className="topbar-right">
          <div className="history-btns">
            <IconTip label="撤回到上一步">
              <button
                className="icon-btn"
                disabled={!canUndo}
                onClick={session.undo}
                aria-label="撤回到上一步"
              >
                <IconUndo size={22} />
              </button>
            </IconTip>
            <IconTip label="重做上一步">
              <button
                className="icon-btn"
                disabled={!canRedo}
                onClick={session.redo}
                aria-label="重做上一步"
              >
                <IconRedo size={22} />
              </button>
            </IconTip>
          </div>
          <button className="export-btn" onClick={onExport} disabled={exporting}>
            {exporting ? '导出中' : '导出'}
          </button>
        </div>
      </div>

      <div
        className="preview-area"
        ref={previewRef}
        onPointerDown={(event) => {
          session.selectAnnotation(null);
          swipe.current = { x: event.clientX, y: event.clientY };
        }}
        onPointerUp={(event) => {
          if (!swipe.current || isDesktop) return;
          const dx = event.clientX - swipe.current.x;
          const dy = event.clientY - swipe.current.y;
          swipe.current = null;
          if (Math.abs(dx) < 56 || Math.abs(dx) < Math.abs(dy)) return;
          if (dx < 0 && currentPageIndex < pages.length - 1) {
            session.setCurrentPage(currentPageIndex + 1);
          }
          if (dx > 0 && currentPageIndex > 0) {
            session.setCurrentPage(currentPageIndex - 1);
          }
        }}
      >
        <div className="page-indicator">
          {pages.length ? `${currentPageIndex + 1} / ${pages.length}` : '0 / 0'}
        </div>
        {currentPage && (
          <div
            className="page-stage"
            ref={stageRef}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <PageCanvas page={currentPage} docs={docs} maxWidth={previewWidth} />
            <AnnotationLayer
              annotations={pageAnns}
              selectedId={selectedAnnotationId}
              onSelect={session.selectAnnotation}
              onCommit={session.updateAnnotation}
              onDelete={session.deleteAnnotation}
            />
          </div>
        )}
      </div>

      <div className="toolbar">
        <button className="tool" onClick={onDeletePage}>
          <IconTrash size={22} />
          删除
        </button>
        <button className="tool" onClick={() => setSheet('add')}>
          <IconPlus size={22} />
          添加
        </button>
        <button className="tool" onClick={session.openSignature}>
          <IconSign size={22} />
          签名
        </button>
        <button className="tool" onClick={() => setSheet('text')}>
          <IconText size={22} />
          文字
        </button>
        <button className="tool" onClick={session.rotateCurrentPage}>
          <IconRotate size={22} />
          旋转
        </button>
      </div>

      <div className="thumbs">
        {pages.map((page, index) => (
          <div
            key={page.id}
            className={`thumb ${index === currentPageIndex ? 'active' : ''}`}
            draggable
            onClick={() => session.setCurrentPage(index)}
            onDragStart={(event) => {
              event.dataTransfer.setData('text/plain', String(index));
            }}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const from = Number(event.dataTransfer.getData('text/plain'));
              if (!Number.isNaN(from)) session.reorderPage(from, index);
            }}
          >
            <PageCanvas page={page} docs={docs} maxWidth={54} />
            <span className="thumb-index">{index + 1}</span>
          </div>
        ))}
      </div>

      {sheet && <div className="sheet-mask" onClick={() => setSheet(null)} />}

      {sheet === 'add' && (
        <div className="sheet">
          <div className="sheet-grabber" />
          <h3>添加页面</h3>
          <div className="sheet-group">
          <button className="sheet-item" onClick={onAddImage}>
            <IconImage size={20} />
            ＋ 图片
          </button>
          <button className="sheet-item" onClick={onAddPdf}>
            <IconFile size={20} />
            ＋ PDF
          </button>
          <button className="sheet-item" onClick={() => setSheet('blank')}>
            <IconBlank size={20} />
            ＋ 空白页
          </button>
          </div>
          <button className="sheet-cancel" onClick={() => setSheet(null)}>
            取消
          </button>
        </div>
      )}

      {sheet === 'fit' && (
        <div className="sheet">
          <div className="sheet-grabber" />
          <h3>图片怎么放进页面</h3>
          <div className="sheet-group">
          <button className="sheet-item" onClick={() => confirmFit('contain')}>
            适应页面（保持比例，完整显示）
          </button>
          <button className="sheet-item" onClick={() => confirmFit('cover')}>
            填满页面（保持比例，可能裁切）
          </button>
          <button className="sheet-item" onClick={() => confirmFit('original')}>
            原始尺寸
          </button>
          </div>
          <button className="sheet-cancel" onClick={() => setSheet(null)}>
            取消
          </button>
        </div>
      )}

      {sheet === 'blank' && (
        <div className="sheet">
          <div className="sheet-grabber" />
          <h3>空白页方向</h3>
          <div className="sheet-group">
          <button
            className="sheet-item"
            onClick={() => {
              session.addBlankPage(false);
              setSheet(null);
            }}
          >
            纵向（当前页面尺寸）
          </button>
          <button
            className="sheet-item"
            onClick={() => {
              session.addBlankPage(true);
              setSheet(null);
            }}
          >
            横向
          </button>
          </div>
          <button className="sheet-cancel" onClick={() => setSheet(null)}>
            取消
          </button>
        </div>
      )}

      {sheet === 'text' && (
        <div className="sheet">
          <div className="sheet-grabber" />
          <h3>添加文字</h3>
          <textarea
            value={textValue}
            onChange={(event) => setTextValue(event.target.value)}
            placeholder="输入要加到这一页的文字"
            rows={4}
            style={{
              width: '100%',
              border: '1px solid var(--border)',
              borderRadius: 12,
              padding: 12,
              resize: 'vertical'
            }}
          />
          <div className="footer-bar" style={{ border: 0, padding: '12px 0 0' }}>
            <button className="ghost-btn" style={{ margin: 0 }} onClick={() => setSheet(null)}>
              取消
            </button>
            <button
              className="primary-btn"
              style={{ margin: 0 }}
              onClick={() => {
                const value = textValue.trim();
                if (!value) return;
                session.addText(value);
                setTextValue('');
                setSheet(null);
              }}
            >
              添加到页面
            </button>
          </div>
        </div>
      )}

      {sheet === 'export' && (
        <div className="sheet">
          <div className="sheet-grabber" />
          <h3>导出 PDF</h3>
          <div className="sheet-group">
            <button
              className="sheet-item sheet-item-stack"
              aria-label="直接导出"
              onClick={() => confirmExport('original')}
            >
              <span className="sheet-item-row">
                <span>直接导出</span>
                <span className="sheet-item-meta">{formatSize(exportSizes.original)}</span>
              </span>
              <span className="sheet-item-sub">免费，不看广告</span>
            </button>
            <button
              className="sheet-item sheet-item-stack"
              aria-label="高画质压缩"
              onClick={() => startCompress('high')}
            >
              <span className="sheet-item-row">
                <span>高画质压缩</span>
                <span className="sheet-item-meta">{formatEstimate(exportSizes.high)}</span>
              </span>
              <span className="sheet-item-sub">看完广告后导出</span>
            </button>
            <button
              className="sheet-item sheet-item-stack"
              aria-label="中画质压缩"
              onClick={() => startCompress('medium')}
            >
              <span className="sheet-item-row">
                <span>中画质压缩</span>
                <span className="sheet-item-meta">{formatEstimate(exportSizes.medium)}</span>
              </span>
              <span className="sheet-item-sub">看完广告后导出</span>
            </button>
            <button
              className="sheet-item sheet-item-stack"
              aria-label="低画质压缩"
              onClick={() => startCompress('low')}
            >
              <span className="sheet-item-row">
                <span>低画质压缩</span>
                <span className="sheet-item-meta">{formatEstimate(exportSizes.low)}</span>
              </span>
              <span className="sheet-item-sub">看完广告后导出</span>
            </button>
            <button
              className="sheet-item sheet-item-stack"
              aria-label="导出为图片"
              onClick={() => void exportAsImages()}
            >
              <span className="sheet-item-row">
                <span>导出为图片</span>
                <span className="sheet-item-meta">PNG</span>
              </span>
              <span className="sheet-item-sub">免费，一页一张</span>
            </button>
          </div>
          <p className="sheet-note">编辑、直接导出和转图片都免费。压缩会把每一页变成图片，扫描件通常更小，纯文字稿可能变大。</p>
          <button className="sheet-cancel" onClick={() => setSheet(null)}>
            取消
          </button>
        </div>
      )}

      {sheet === 'ad' && pendingQuality && (
        <div className="sheet">
          <div className="sheet-grabber" />
          <h3>看完广告后压缩导出</h3>
          <p className="sheet-note ad-lead">功能都免费。只有压缩导出需要看一段广告。</p>
          <div className="ad-slot" aria-label="广告">
            <span>广告</span>
          </div>
          <p className="ad-count">
            {adLeft > 0 ? `${adLeft} 秒后可以导出` : '可以导出了'}
          </p>
          <button
            className="primary-btn ad-export"
            disabled={adLeft > 0 || exporting}
            onClick={() => void confirmExport(pendingQuality)}
          >
            {adLeft > 0 ? `请稍等 ${adLeft} 秒` : '导出压缩文件'}
          </button>
          <button className="sheet-cancel" onClick={() => setSheet('export')}>
            取消
          </button>
        </div>
      )}

      <Toast message={toast} />
    </div>
  );
}

function AnnotationLayer({
  annotations,
  selectedId,
  onSelect,
  onCommit,
  onDelete
}: {
  annotations: Annotation[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onCommit: (id: string, patch: Partial<Annotation>) => void;
  onDelete: (id: string) => void;
}) {
  const [live, setLive] = useState<Record<string, Annotation>>({});
  const liveRef = useRef<Record<string, Annotation>>({});

  useEffect(() => {
    const next = Object.fromEntries(annotations.map((item) => [item.id, item]));
    liveRef.current = next;
    setLive(next);
  }, [annotations]);

  const drag = useRef<{
    id: string;
    mode: 'move' | 'resize';
    startX: number;
    startY: number;
    origin: Annotation;
  } | null>(null);

  function display(item: Annotation) {
    return live[item.id] || item;
  }

  function onPointerDown(
    event: PointerEvent<HTMLDivElement>,
    item: Annotation,
    mode: 'move' | 'resize'
  ) {
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    onSelect(item.id);
    drag.current = {
      id: item.id,
      mode,
      startX: event.clientX,
      startY: event.clientY,
      origin: display(item)
    };
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>, item: Annotation) {
    if (!drag.current || drag.current.id !== item.id) return;
    const parent = (event.currentTarget as HTMLElement).parentElement;
    if (!parent) return;
    const box = parent.getBoundingClientRect();
    const dx = (event.clientX - drag.current.startX) / box.width;
    const dy = (event.clientY - drag.current.startY) / box.height;
    const origin = drag.current.origin;
    const next =
      drag.current.mode === 'move'
        ? {
            ...origin,
            x: clamp(origin.x + dx, 0, 1 - origin.width),
            y: clamp(origin.y + dy, 0, 1 - origin.height)
          }
        : {
            ...origin,
            width: clamp(origin.width + dx, 0.08, 1 - origin.x),
            height: clamp(origin.height + dy, 0.05, 1 - origin.y)
          };
    const merged = { ...liveRef.current, [item.id]: next };
    liveRef.current = merged;
    setLive(merged);
  }

  function onPointerUp(item: Annotation) {
    if (!drag.current || drag.current.id !== item.id) return;
    const next = liveRef.current[item.id];
    drag.current = null;
    if (next) onCommit(item.id, next);
  }

  return (
    <>
      {annotations.map((item) => {
        const current = display(item);
        return (
          <div
            key={item.id}
            className={`ann ${selectedId === item.id ? 'selected' : ''}`}
            style={{
              left: `${current.x * 100}%`,
              top: `${current.y * 100}%`,
              width: `${current.width * 100}%`,
              height: `${current.height * 100}%`,
              fontSize: current.fontSize || 16,
              color: current.color || '#111'
            }}
            onPointerDown={(event) => onPointerDown(event, item, 'move')}
            onPointerMove={(event) => onPointerMove(event, item)}
            onPointerUp={() => onPointerUp(item)}
          >
            {item.type === 'text' ? (
              <div className="ann-text">{current.content}</div>
            ) : (
              <img className="ann-image" src={current.content} alt="签名" />
            )}
            {selectedId === item.id && (
              <>
                <div
                  className="ann-handle"
                  onPointerDown={(event) => onPointerDown(event, item, 'resize')}
                />
                <button
                  className="icon-btn"
                  style={{ position: 'absolute', top: -28, right: -8, color: '#ef4444' }}
                  onClick={(event) => {
                    event.stopPropagation();
                    onDelete(item.id);
                  }}
                >
                  删除
                </button>
              </>
            )}
          </div>
        );
      })}
    </>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
