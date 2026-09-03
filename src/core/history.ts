import type { Annotation, HistorySnapshot, PageInfo } from './types';

const LIMIT = 30;

export function clonePages(pages: PageInfo[]): PageInfo[] {
  return pages.map((page) => ({
    ...page,
    source: { ...page.source }
  }));
}

export function cloneAnnotations(annotations: Annotation[]): Annotation[] {
  return annotations.map((item) => ({ ...item }));
}

export function takeSnapshot(
  pages: PageInfo[],
  annotations: Annotation[],
  currentPageIndex: number
): HistorySnapshot {
  return {
    pages: clonePages(pages),
    annotations: cloneAnnotations(annotations),
    currentPageIndex
  };
}

export function pushHistory(
  stack: HistorySnapshot[],
  index: number,
  snapshot: HistorySnapshot
): { stack: HistorySnapshot[]; index: number } {
  const next = stack.slice(0, index + 1);
  next.push(snapshot);
  if (next.length > LIMIT) {
    next.shift();
    return { stack: next, index: next.length - 1 };
  }
  return { stack: next, index: next.length - 1 };
}
