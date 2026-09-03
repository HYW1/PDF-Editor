import { useEffect, useRef } from 'react';
import { renderPageToCanvas } from '../core/pdf-render';
import type { LoadedDoc, PageInfo } from '../core/types';

interface PageCanvasProps {
  page: PageInfo;
  docs: Record<string, LoadedDoc>;
  maxWidth: number;
  className?: string;
}

export function PageCanvas({ page, docs, maxWidth, className }: PageCanvasProps) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let cancelled = false;
    renderPageToCanvas(canvas, page, docs, maxWidth).catch((error) => {
      if (!cancelled) console.error(error);
    });
    return () => {
      cancelled = true;
    };
  }, [docs, maxWidth, page]);

  return <canvas ref={ref} className={className} />;
}
