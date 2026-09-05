export type FitMode = 'contain' | 'cover' | 'original';

export type PageSource =
  | { kind: 'pdf'; docId: string; pageIndex: number }
  | { kind: 'image'; bytes: ArrayBuffer; mime: string; name: string; fit: FitMode }
  | { kind: 'blank' };

export interface PageInfo {
  id: string;
  width: number;
  height: number;
  rotation: number;
  nativeRotation?: number;
  source: PageSource;
}

export interface Annotation {
  id: string;
  pageId: string;
  type: 'text' | 'signature' | 'replace';
  x: number;
  y: number;
  width: number;
  height: number;
  content: string;
  original?: string;
  fontSize?: number;
  color?: string;
}

export interface LoadedDoc {
  id: string;
  name: string;
  bytes: ArrayBuffer;
  pageCount: number;
}

export interface UserQuota {
  exportCount: number;
  maxFileSize: number;
  unlocked: boolean;
  adWatched: boolean;
}

export interface HistorySnapshot {
  pages: PageInfo[];
  annotations: Annotation[];
  currentPageIndex: number;
}

export type AppView = 'home' | 'editor' | 'signature' | 'page-selector' | 'web-to-pdf';
