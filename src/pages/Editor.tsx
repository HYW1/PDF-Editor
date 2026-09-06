import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { compressPdfBytes, compressSuffix, type ExportQuality } from '../core/pdf-compress';
import { COMPRESS_PRESETS, estimateExportSizes, formatEstimate } from '../core/pdf-estimate';
import { downloadBytes } from '../core/files';
import { exportPdf } from '../core/pdf-engine';
import { downloadPageImages, renderPagesToPngs } from '../core/pdf-to-images';
import { formatSize, recordExport } from '../core/quota';
import { extractPageTextLines, type TextLine } from '../core/pdf-text';
import type { Annotation } from '../core/types';
import { usePdfSession } from '../session/PdfSession';
import { FilePick } from '../ui/FilePick';
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
import { PageCanvas, VisiblePageCanvas } from '../ui/PageCanvas';
import { ProgressDialog } from '../ui/ProgressDialog';
import { Toast } from '../ui/Toast';
import { useIsDesktop } from '../ui/useMedia';

type Sheet = 'text-menu' | 'text' | 'text-edit' | 'export' | 'leave' | null;

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
  const [addMode, setAddMode] = useState(false);
  const [textValue, setTextValue] = useState('');
  const [pickingOriginal, setPickingOriginal] = useState(false);
  const [textLines, setTextLines] = useState<TextLine[]>([]);
  const [editingLine, setEditingLine] = useState<TextLine | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [job, setJob] = useState<{ title: string; done: number; total: number } | null>(null);
  const toastTimer = useRef(0);
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
      const widthFromHeight = availH / Math.max(ratio, 0.08);
      setPreviewWidth(Math.floor(Math.min(availW, widthFromHeight, 680)));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [currentPage]);

  function showToast(message: string) {
    setToast(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2200);
  }

  function stopPicking() {
    setPickingOriginal(false);
    setEditingLine(null);
  }

  useEffect(() => {
    if (!pickingOriginal || !currentPage) {
      setTextLines([]);
      return;
    }
    let cancelled = false;
    void extractPageTextLines(currentPage, docs).then((lines) => {
      if (cancelled) return;
      setTextLines(lines);
      if (!lines.length) {
        setPickingOriginal(false);
        showToast('这一页没有可改的文字。扫描件或图片里的字改不了。');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [pickingOriginal, currentPage, docs]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const typing = isTypingTarget(event.target);
      if ((event.metaKey || event.ctrlKey) && event.key === 'z') {
        if (typing) return;
        event.preventDefault();
        if (event.shiftKey) session.redo();
        else session.undo();
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && !typing) {
        if (selectedAnnotationId) session.deleteAnnotation(selectedAnnotationId);
      }
      if (event.key === 'Escape' && pickingOriginal) {
        setPickingOriginal(false);
        setEditingLine(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pickingOriginal, selectedAnnotationId, session]);

  const pageAnns = useMemo(
    () => annotations.filter((item) => currentPage && item.pageId === currentPage.id),
    [annotations, currentPage]
  );

  const exportSizes = useMemo(
    () => estimateExportSizes(pages, docs, annotations),
    [annotations, docs, pages]
  );

  async function onAddImage(files: File[]) {
    setAddMode(false);
    if (!files.length) return;
    try {
      await session.addImagePages(files, 'contain');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '添加图片失败');
    }
  }

  async function onAddPdf(files: File[]) {
    setAddMode(false);
    if (!files[0]) return;
    try {
      await session.startAddPdf(files[0]);
    } catch (error) {
      showToast(error instanceof Error ? error.message : '添加 PDF 失败');
    }
  }

  function onAddBlank() {
    setAddMode(false);
    const landscape = Boolean(currentPage && currentPage.width > currentPage.height);
    session.addBlankPage(landscape);
  }

  async function onExport() {
    if (!pages.length || exporting) return;
    setAddMode(false);
    setSheet('export');
  }

  async function confirmExport(quality: ExportQuality) {
    if (!pages.length || exporting) return;
    setSheet(null);
    try {
      setExporting(true);
      setJob({
        title: quality === 'original' ? '正在导出' : '正在整理页面',
        done: 0,
        total: pages.length
      });
      let bytes = await exportPdf(pages, docs, annotations, (done, total) => {
        setJob({
          title: quality === 'original' ? '正在导出' : '正在整理页面',
          done,
          total
        });
      });
      const beforeCompress = bytes.byteLength;
      if (quality !== 'original') {
        bytes = await compressPdfBytes(bytes, quality, (done, total) => {
          setJob({ title: '正在压缩', done, total });
        });
      }
      recordExport();
      const shrunk = quality !== 'original' && bytes.byteLength < beforeCompress;
      const suffix = quality === 'original' || !shrunk ? '_编辑.pdf' : `_${compressSuffix(quality)}.pdf`;
      const name = fileName.replace(/\.pdf$/i, '') + suffix;
      downloadBytes(bytes, name);
      setJob(null);
      showToast(quality !== 'original' && !shrunk ? '这份文件已经很小，压不下去了' : '已导出');
    } catch (error) {
      console.error(error);
      setJob(null);
      showToast(error instanceof Error ? error.message : '导出失败');
    } finally {
      setExporting(false);
    }
  }

  async function exportAsImages() {
    if (!pages.length || exporting) return;
    setSheet(null);
    try {
      setExporting(true);
      setJob({ title: '正在导出图片', done: 0, total: pages.length });
      const images = await renderPagesToPngs(pages, docs, annotations, (done, total) => {
        setJob({ title: '正在导出图片', done, total });
      });
      downloadPageImages(images, fileName);
      setJob(null);
      showToast(images.length === 1 ? '已导出图片' : `已导出 ${images.length} 张图片`);
    } catch (error) {
      console.error(error);
      setJob(null);
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

  function onBack() {
    if (session.canUndo || annotations.length) {
      setSheet('leave');
      return;
    }
    session.goHome();
  }

  return (
    <div className="editor">
      <div className="topbar">
        <div className="topbar-main">
          <div className="topbar-left">
            <button className="nav-btn" onClick={onBack}>
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
      </div>

      <div
        className="preview-area"
        ref={previewRef}
        onPointerDown={(event) => {
          session.selectAnnotation(null);
          swipe.current = { x: event.clientX, y: event.clientY };
        }}
        onPointerUp={(event) => {
          if (pickingOriginal || !swipe.current || isDesktop) return;
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
            <PageCanvas page={currentPage} docs={docs} maxWidth={previewWidth} quality="preview" />
            <AnnotationLayer
              annotations={pageAnns}
              selectedId={selectedAnnotationId}
              scale={previewWidth / (currentPage.width || 1)}
              onSelect={session.selectAnnotation}
              onCommit={session.updateAnnotation}
              onDelete={session.deleteAnnotation}
            />
            {pickingOriginal && (
              <TextHitLayer
                lines={textLines}
                onPick={(line) => {
                  const existing = annotations.find(
                    (item) =>
                      item.type === 'replace' &&
                      item.pageId === currentPage.id &&
                      item.original === line.text &&
                      Math.abs(item.x - line.x) < 0.012
                  );
                  setEditingLine(line);
                  setTextValue(existing?.content || line.text);
                  setSheet('text-edit');
                }}
              />
            )}
          </div>
        )}
        {pickingOriginal && (
          <div className="pick-banner">
            <span>点要改的那一行。扫描件改不了。</span>
            <button type="button" onClick={stopPicking}>
              取消
            </button>
          </div>
        )}
      </div>

      <div className="toolbar">
        {addMode ? (
          <>
            <FilePick
              className="tool"
              accept="image/*"
              multiple
              label="添加图片"
              onFiles={(files) => void onAddImage(files)}
            >
              <IconImage size={22} />
              图片
            </FilePick>
            <FilePick
              className="tool"
              accept="application/pdf,.pdf"
              label="添加 PDF"
              onFiles={(files) => void onAddPdf(files)}
            >
              <IconFile size={22} />
              PDF
            </FilePick>
            <button
              className="tool"
              onClick={() => {
                stopPicking();
                onAddBlank();
              }}
            >
              <IconBlank size={22} />
              空白
            </button>
            <button className="tool" onClick={() => setAddMode(false)}>
              <span className="tool-cancel">×</span>
              取消
            </button>
          </>
        ) : (
          <>
            <button
              className="tool"
              onClick={() => {
                stopPicking();
                onDeletePage();
              }}
            >
              <IconTrash size={22} />
              删除
            </button>
            <button
              className="tool"
              onClick={() => {
                stopPicking();
                setSheet(null);
                setAddMode(true);
              }}
            >
              <IconPlus size={22} />
              添加
            </button>
            <button
              className="tool"
              onClick={() => {
                stopPicking();
                session.openSignature();
              }}
            >
              <IconSign size={22} />
              签名
            </button>
            <button className="tool" onClick={() => setSheet('text-menu')}>
              <IconText size={22} />
              文字
            </button>
            <button
              className="tool"
              onClick={() => {
                stopPicking();
                session.rotateCurrentPage();
              }}
            >
              <IconRotate size={22} />
              旋转
            </button>
          </>
        )}
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
            <VisiblePageCanvas
              page={page}
              docs={docs}
              maxWidth={54}
              quality="thumb"
              eager={Math.abs(index - currentPageIndex) <= 1}
            />
            <span className="thumb-index">{index + 1}</span>
          </div>
        ))}
      </div>

      {sheet && (
        <div
          className="sheet-mask"
          onClick={() => {
            if (sheet === 'text-edit') setEditingLine(null);
            setSheet(null);
          }}
        />
      )}

      {sheet === 'text-menu' && (
        <div className="sheet">
          <div className="sheet-grabber" />
          <h3>文字</h3>
          <div className="sheet-group">
            <button
              className="sheet-item sheet-item-stack"
              onClick={() => {
                if (!currentPage || currentPage.source.kind !== 'pdf') {
                  setSheet(null);
                  showToast('这一页没有可改的原文');
                  return;
                }
                setSheet(null);
                setPickingOriginal(true);
                showToast('点要改的那一行');
              }}
            >
              <span className="sheet-item-row">
                <span>改原文</span>
              </span>
              <span className="sheet-item-sub">改 PDF 里已经有的字</span>
            </button>
            <button
              className="sheet-item sheet-item-stack"
              onClick={() => {
                setPickingOriginal(false);
                setSheet('text');
              }}
            >
              <span className="sheet-item-row">
                <span>添加新文字</span>
              </span>
              <span className="sheet-item-sub">在页面上新加一行</span>
            </button>
          </div>
          <button
            className="sheet-cancel"
            onClick={() => {
              setPickingOriginal(false);
              setSheet(null);
            }}
          >
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
                if (!value) {
                  showToast('请先输入文字');
                  return;
                }
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

      {sheet === 'text-edit' && editingLine && (
        <div className="sheet">
          <div className="sheet-grabber" />
          <h3>改原文</h3>
          <textarea
            value={textValue}
            onChange={(event) => setTextValue(event.target.value)}
            placeholder="改这一行的文字"
            rows={3}
          />
          <p className="sheet-note">会盖住原来的字再写上新的。扫描件改不了。</p>
          <div className="footer-bar" style={{ border: 0, padding: '12px 0 0' }}>
            <button
              className="ghost-btn"
              style={{ margin: 0 }}
              onClick={() => {
                setSheet(null);
                setEditingLine(null);
              }}
            >
              取消
            </button>
            <button
              className="primary-btn"
              style={{ margin: 0 }}
              onClick={() => {
                session.replaceOriginalText(editingLine, textValue);
                setSheet(null);
                setEditingLine(null);
                setPickingOriginal(false);
              }}
            >
              保存
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
              onClick={() => void confirmExport('original')}
            >
              <span className="sheet-item-row">
                <span>直接导出</span>
                <span className="sheet-item-meta">{formatSize(exportSizes.original)}</span>
              </span>
              <span className="sheet-item-sub">保持原文件，不压缩</span>
            </button>
            <button
              className="sheet-item sheet-item-stack"
              aria-label={COMPRESS_PRESETS.high.label}
              onClick={() => void confirmExport('high')}
            >
              <span className="sheet-item-row">
                <span>{COMPRESS_PRESETS.high.label}</span>
                <span className="sheet-item-meta">{formatEstimate(exportSizes.high)}</span>
              </span>
              <span className="sheet-item-sub">{COMPRESS_PRESETS.high.hint}</span>
            </button>
            <button
              className="sheet-item sheet-item-stack"
              aria-label={COMPRESS_PRESETS.medium.label}
              onClick={() => void confirmExport('medium')}
            >
              <span className="sheet-item-row">
                <span>{COMPRESS_PRESETS.medium.label}</span>
                <span className="sheet-item-meta">{formatEstimate(exportSizes.medium)}</span>
              </span>
              <span className="sheet-item-sub">{COMPRESS_PRESETS.medium.hint}</span>
            </button>
            <button
              className="sheet-item sheet-item-stack"
              aria-label={COMPRESS_PRESETS.low.label}
              onClick={() => void confirmExport('low')}
            >
              <span className="sheet-item-row">
                <span>{COMPRESS_PRESETS.low.label}</span>
                <span className="sheet-item-meta">{formatEstimate(exportSizes.low)}</span>
              </span>
              <span className="sheet-item-sub">{COMPRESS_PRESETS.low.hint}</span>
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
              <span className="sheet-item-sub">一页一张图片</span>
            </button>
          </div>
          <p className="sheet-note">压缩会压到比原文件小。扫描件、PPT、图片多通常更明显；已经很小或纯文字的稿，可能压不下去。</p>
          <button className="sheet-cancel" onClick={() => setSheet(null)}>
            取消
          </button>
        </div>
      )}

      {sheet === 'leave' && (
        <div className="dialog" role="alertdialog" aria-labelledby="leave-title" aria-modal="true">
          <h3 id="leave-title">返回首页</h3>
          <p>返回后，这次还没导出的修改会丢掉。</p>
          <div className="dialog-actions">
            <button type="button" className="dialog-btn" onClick={() => setSheet(null)}>
              留下
            </button>
            <button
              type="button"
              className="dialog-btn dialog-btn-primary"
              onClick={() => {
                setSheet(null);
                session.goHome();
              }}
            >
              返回
            </button>
          </div>
        </div>
      )}

      {job && <ProgressDialog title={job.title} done={job.done} total={job.total} />}
      <Toast message={toast} />
    </div>
  );
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
}

function TextHitLayer({
  lines,
  onPick
}: {
  lines: TextLine[];
  onPick: (line: TextLine) => void;
}) {
  return (
    <>
      {lines.map((line) => (
        <button
          key={line.id}
          type="button"
          className="text-hit"
          aria-label={line.text}
          style={{
            left: `${line.x * 100}%`,
            top: `${line.y * 100}%`,
            width: `${line.width * 100}%`,
            height: `${line.height * 100}%`
          }}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => onPick(line)}
        />
      ))}
    </>
  );
}

function AnnotationLayer({
  annotations,
  selectedId,
  scale,
  onSelect,
  onCommit,
  onDelete
}: {
  annotations: Annotation[];
  selectedId: string | null;
  scale: number;
  onSelect: (id: string | null) => void;
  onCommit: (id: string, patch: Partial<Annotation>) => void;
  onDelete: (id: string) => void;
}) {
  const [live, setLive] = useState<Record<string, Annotation>>({});
  const [menuId, setMenuId] = useState<string | null>(null);
  const liveRef = useRef<Record<string, Annotation>>({});
  const holdTimer = useRef(0);
  const dragging = useRef(false);

  useEffect(() => {
    const next = Object.fromEntries(annotations.map((item) => [item.id, item]));
    liveRef.current = next;
    setLive(next);
  }, [annotations]);

  useEffect(() => {
    if (!selectedId) setMenuId(null);
  }, [selectedId]);

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

  function clearHold() {
    window.clearTimeout(holdTimer.current);
    holdTimer.current = 0;
  }

  function onPointerDown(
    event: PointerEvent<HTMLDivElement>,
    item: Annotation,
    mode: 'move' | 'resize'
  ) {
    event.stopPropagation();
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    onSelect(item.id);
    dragging.current = false;
    clearHold();
    if (mode === 'move') {
      setMenuId(null);
      holdTimer.current = window.setTimeout(() => {
        setMenuId(item.id);
        holdTimer.current = 0;
      }, 480);
    }
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
    const px = event.clientX - drag.current.startX;
    const py = event.clientY - drag.current.startY;
    if (!dragging.current && Math.hypot(px, py) > 8) {
      dragging.current = true;
      clearHold();
      setMenuId(null);
    }
    if (!dragging.current) return;
    const dx = px / box.width;
    const dy = py / box.height;
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
    const moved = dragging.current;
    drag.current = null;
    dragging.current = false;
    clearHold();
    if (moved && next) onCommit(item.id, next);
  }

  return (
    <>
      {annotations.map((item) => {
        const current = display(item);
        return (
          <div
            key={item.id}
            className={`ann ${item.type === 'replace' ? 'replace' : ''} ${selectedId === item.id ? 'selected' : ''}`}
            style={{
              left: `${current.x * 100}%`,
              top: `${current.y * 100}%`,
              width: `${current.width * 100}%`,
              height: `${current.height * 100}%`,
              fontSize:
                item.type === 'replace' && current.fontSize
                  ? current.fontSize * scale
                  : current.fontSize || 16,
              color: current.color || '#111'
            }}
            onContextMenu={(event) => event.preventDefault()}
            onPointerDown={(event) => onPointerDown(event, item, 'move')}
            onPointerMove={(event) => onPointerMove(event, item)}
            onPointerUp={() => onPointerUp(item)}
            onPointerCancel={() => onPointerUp(item)}
          >
            {item.type === 'signature' ? (
              <img className="ann-image" src={current.content} alt="签名" />
            ) : (
              <div className="ann-text">{current.content}</div>
            )}
            {selectedId === item.id && (
              <div
                className="ann-handle"
                onPointerDown={(event) => onPointerDown(event, item, 'resize')}
              />
            )}
            {menuId === item.id && (
              <button
                type="button"
                className="ann-delete"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  onDelete(item.id);
                  setMenuId(null);
                }}
              >
                删除
              </button>
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
