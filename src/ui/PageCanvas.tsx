import { useEffect, useRef, useState } from 'react';
import { cancelRender, pageRenderKey, renderPageToCanvas, type RenderQuality } from '../core/pdf-render';
import type { LoadedDoc, PageInfo } from '../core/types';

interface PageCanvasProps {
  page: PageInfo;
  docs: Record<string, LoadedDoc>;
  maxWidth: number;
  className?: string;
  quality?: RenderQuality;
}

export function PageCanvas({ page, docs, maxWidth, className, quality = 'preview' }: PageCanvasProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const renderKey = pageRenderKey(page);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let cancelled = false;
    renderPageToCanvas(canvas, page, docs, maxWidth, quality).catch((error) => {
      if (!cancelled) console.error(error);
    });
    return () => {
      cancelled = true;
      cancelRender(canvas);
    };
  }, [docs, maxWidth, page, quality, renderKey]);

  return <canvas ref={ref} className={className} />;
}

export function VisiblePageCanvas({
  eager = false,
  className,
  ...props
}: PageCanvasProps & { eager?: boolean }) {
  const slot = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(eager);

  useEffect(() => {
    if (visible) return;
    const el = slot.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: '240px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);

  return (
    <div ref={slot} className={`page-canvas-slot ${className || ''}`}>
      {visible ? <PageCanvas {...props} /> : <div className="page-canvas-skel" />}
    </div>
  );
}
