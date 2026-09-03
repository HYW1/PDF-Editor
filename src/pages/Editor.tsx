import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { downloadBytes, pickFiles } from '../core/files';
import { exportPdf } from '../core/pdf-engine';
import { recordExport } from '../core/quota';
import type { Annotation, FitMode } from '../core/types';
import { usePdfSession } from '../session/PdfSession';
import { PageCanvas } from '../ui/PageCanvas';
import { Toast } from '../ui/Toast';

type Sheet = 'add' | 'fit' | 'blank' | 'text' | null;

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
  const stageRef = useRef<HTMLDivElement>(null);
  const [previewWidth, setPreviewWidth] = useState(320);

  useEffect(() => {
    const update = () => {
      const wide = window.innerWidth >= 860;
      setPreviewWidth(Math.min(wide ? 620 : window.innerWidth - 32, 620));
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

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
    try {
      setExporting(true);
      const bytes = await exportPdf(pages, docs, annotations);
      recordExport();
      const name = fileName.replace(/\.pdf$/i, '') + '_编辑.pdf';
      downloadBytes(bytes, name);
      showToast('已导出新的 PDF');
    } catch (error) {
      console.error(error);
      showToast(error instanceof Error ? error.message : '导出失败');
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
          <button className="text-btn" onClick={session.goHome}>
            返回
          </button>
          <div className="file-name">{fileName}</div>
        </div>
        <div className="topbar-right">
          <button className="icon-btn" disabled={!canUndo} onClick={session.undo} title="撤销">
            ↶
          </button>
          <button className="icon-btn" disabled={!canRedo} onClick={session.redo} title="重做">
            ↷
          </button>
          <button className="export-btn" onClick={onExport} disabled={exporting}>
            {exporting ? '导出中' : '导出'}
          </button>
        </div>
      </div>

      <div className="preview-area" onPointerDown={() => session.selectAnnotation(null)}>
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
          <span className="tool-icon">⌫</span>
          删除
        </button>
        <button className="tool" onClick={() => setSheet('add')}>
          <span className="tool-icon">＋</span>
          添加
        </button>
        <button className="tool" onClick={session.openSignature}>
          <span className="tool-icon">✍</span>
          签名
        </button>
        <button className="tool" onClick={() => setSheet('text')}>
          <span className="tool-icon">T</span>
          文字
        </button>
        <button className="tool" onClick={session.rotateCurrentPage}>
          <span className="tool-icon">↻</span>
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
          <h3>添加页面</h3>
          <button className="sheet-item" onClick={onAddImage}>
            ＋ 图片
          </button>
          <button className="sheet-item" onClick={onAddPdf}>
            ＋ PDF
          </button>
          <button className="sheet-item" onClick={() => setSheet('blank')}>
            ＋ 空白页
          </button>
          <button className="sheet-cancel" onClick={() => setSheet(null)}>
            取消
          </button>
        </div>
      )}

      {sheet === 'fit' && (
        <div className="sheet">
          <h3>图片如何放入页面</h3>
          <button className="sheet-item" onClick={() => confirmFit('contain')}>
            适应页面（保持比例，完整显示）
          </button>
          <button className="sheet-item" onClick={() => confirmFit('cover')}>
            填满页面（保持比例，可能裁切）
          </button>
          <button className="sheet-item" onClick={() => confirmFit('original')}>
            原始尺寸
          </button>
          <button className="sheet-cancel" onClick={() => setSheet(null)}>
            取消
          </button>
        </div>
      )}

      {sheet === 'blank' && (
        <div className="sheet">
          <h3>空白页方向</h3>
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
          <button className="sheet-cancel" onClick={() => setSheet(null)}>
            取消
          </button>
        </div>
      )}

      {sheet === 'text' && (
        <div className="sheet">
          <h3>添加文字</h3>
          <textarea
            value={textValue}
            onChange={(event) => setTextValue(event.target.value)}
            placeholder="输入要加到当前页的文字"
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
