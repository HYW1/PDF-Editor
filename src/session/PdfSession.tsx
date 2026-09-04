import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode
} from 'react';
import { pushHistory, takeSnapshot } from '../core/history';
import { generateId } from '../core/id';
import {
  insertPages,
  loadPdfFile,
  makeBlankPage,
  makeImagePages,
  movePage,
  rotatePage
} from '../core/pdf-engine';
import type {
  Annotation,
  AppView,
  FitMode,
  HistorySnapshot,
  LoadedDoc,
  PageInfo
} from '../core/types';

interface SessionState {
  view: AppView;
  fileName: string;
  docs: Record<string, LoadedDoc>;
  pages: PageInfo[];
  annotations: Annotation[];
  currentPageIndex: number;
  selectedAnnotationId: string | null;
  pendingDoc: LoadedDoc | null;
  pendingPages: PageInfo[];
  canUndo: boolean;
  canRedo: boolean;
}

interface SessionApi extends SessionState {
  goHome: () => void;
  openWebToPdf: () => void;
  openEditorFromFiles: (files: File[]) => Promise<void>;
  setCurrentPage: (index: number) => void;
  deleteCurrentPage: () => void;
  rotateCurrentPage: () => void;
  reorderPage: (from: number, to: number) => void;
  addBlankPage: (landscape: boolean) => void;
  addImagePages: (files: File[], fit: FitMode) => Promise<void>;
  startAddPdf: (file: File) => Promise<void>;
  confirmAddPdf: (indices: number[], position: 'before' | 'after') => void;
  cancelAddPdf: () => void;
  openSignature: () => void;
  backToEditor: () => void;
  addSignature: (dataUrl: string) => void;
  addText: (text: string) => void;
  updateAnnotation: (id: string, patch: Partial<Annotation>) => void;
  deleteAnnotation: (id: string) => void;
  selectAnnotation: (id: string | null) => void;
  undo: () => void;
  redo: () => void;
  currentPage: PageInfo | null;
}

const Ctx = createContext<SessionApi | null>(null);

const empty: Pick<
  SessionState,
  'fileName' | 'docs' | 'pages' | 'annotations' | 'currentPageIndex' | 'selectedAnnotationId'
> = {
  fileName: '',
  docs: {},
  pages: [],
  annotations: [],
  currentPageIndex: 0,
  selectedAnnotationId: null
};

export function PdfSessionProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState<AppView>('home');
  const [fileName, setFileName] = useState('');
  const [docs, setDocs] = useState<Record<string, LoadedDoc>>({});
  const [pages, setPages] = useState<PageInfo[]>([]);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const [pendingDoc, setPendingDoc] = useState<LoadedDoc | null>(null);
  const [pendingPages, setPendingPages] = useState<PageInfo[]>([]);
  const [history, setHistory] = useState<HistorySnapshot[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const commit = useCallback(
    (nextPages: PageInfo[], nextAnnotations: Annotation[], nextIndex = currentPageIndex) => {
      const snapshot = takeSnapshot(nextPages, nextAnnotations, nextIndex);
      const pushed = pushHistory(history, historyIndex, snapshot);
      setHistory(pushed.stack);
      setHistoryIndex(pushed.index);
      setPages(nextPages);
      setAnnotations(nextAnnotations);
      setCurrentPageIndex(Math.max(0, Math.min(nextIndex, nextPages.length - 1)));
    },
    [currentPageIndex, history, historyIndex]
  );

  const goHome = useCallback(() => {
    setView('home');
    setFileName(empty.fileName);
    setDocs({});
    setPages([]);
    setAnnotations([]);
    setCurrentPageIndex(0);
    setSelectedAnnotationId(null);
    setPendingDoc(null);
    setPendingPages([]);
    setHistory([]);
    setHistoryIndex(-1);
  }, []);

  const openEditorFromFiles = useCallback(async (files: File[]) => {
    if (!files.length) return;
    const nextDocs: Record<string, LoadedDoc> = {};
    const nextPages: PageInfo[] = [];
    try {
      for (const file of files) {
        const loaded = await loadPdfFile(file);
        nextDocs[loaded.doc.id] = loaded.doc;
        nextPages.push(...loaded.pages);
      }
    } catch (error) {
      console.error(error);
      throw new Error('无法读取这个 PDF，文件可能已损坏或设备内存不足');
    }
    if (!nextPages.length) throw new Error('没有可读取的 PDF 页面');
    const snapshot = takeSnapshot(nextPages, [], 0);
    setDocs(nextDocs);
    setPages(nextPages);
    setAnnotations([]);
    setCurrentPageIndex(0);
    setFileName(files.length === 1 ? files[0].name : `合并_${files.length}个文件.pdf`);
    setHistory([snapshot]);
    setHistoryIndex(0);
    setSelectedAnnotationId(null);
    setView('editor');
  }, []);

  const deleteCurrentPage = useCallback(() => {
    if (pages.length <= 1) return;
    const next = pages.filter((_, index) => index !== currentPageIndex);
    const kept = annotations.filter((item) => item.pageId !== pages[currentPageIndex].id);
    commit(next, kept, Math.min(currentPageIndex, next.length - 1));
  }, [annotations, commit, currentPageIndex, pages]);

  const rotateCurrentPage = useCallback(() => {
    const next = pages.map((page, index) =>
      index === currentPageIndex ? rotatePage(page, 90) : page
    );
    commit(next, annotations, currentPageIndex);
  }, [annotations, commit, currentPageIndex, pages]);

  const reorderPage = useCallback(
    (from: number, to: number) => {
      const next = movePage(pages, from, to);
      commit(next, annotations, to);
    },
    [annotations, commit, pages]
  );

  const addBlankPage = useCallback(
    (landscape: boolean) => {
      const blank = makeBlankPage(pages, landscape);
      const next = insertPages(pages, [blank], currentPageIndex, 'after');
      commit(next, annotations, currentPageIndex + 1);
    },
    [annotations, commit, currentPageIndex, pages]
  );

  const addImagePages = useCallback(
    async (files: File[], fit: FitMode) => {
      if (!files.length) return;
      const current = pages[currentPageIndex] || pages[0];
      const size = current ? { width: current.width, height: current.height } : { width: 595.28, height: 841.89 };
      const incoming = await makeImagePages(files, size, fit);
      const next = insertPages(pages, incoming, currentPageIndex, 'after');
      commit(next, annotations, currentPageIndex + 1);
    },
    [annotations, commit, currentPageIndex, pages]
  );

  const startAddPdf = useCallback(async (file: File) => {
    try {
      const loaded = await loadPdfFile(file);
      setPendingDoc(loaded.doc);
      setPendingPages(loaded.pages);
      setView('page-selector');
    } catch (error) {
      console.error(error);
      throw new Error('无法读取这个 PDF，文件可能已损坏或设备内存不足');
    }
  }, []);

  const confirmAddPdf = useCallback(
    (indices: number[], position: 'before' | 'after') => {
      if (!pendingDoc) return;
      const incoming = indices
        .map((index) => pendingPages[index])
        .filter(Boolean)
        .map((page) => ({ ...page, id: generateId('page') }));
      setDocs((prev) => ({ ...prev, [pendingDoc.id]: pendingDoc }));
      const next = insertPages(pages, incoming, currentPageIndex, position);
      const nextIndex = position === 'before' ? currentPageIndex : currentPageIndex + 1;
      setPendingDoc(null);
      setPendingPages([]);
      setView('editor');
      commit(next, annotations, incoming.length ? nextIndex : currentPageIndex);
    },
    [annotations, commit, currentPageIndex, pages, pendingDoc, pendingPages]
  );

  const cancelAddPdf = useCallback(() => {
    setPendingDoc(null);
    setPendingPages([]);
    setView('editor');
  }, []);

  const addSignature = useCallback(
    (dataUrl: string) => {
      const page = pages[currentPageIndex];
      if (!page) return;
      const next = [
        ...annotations,
        {
          id: generateId('ann'),
          pageId: page.id,
          type: 'signature' as const,
          x: 0.55,
          y: 0.72,
          width: 0.32,
          height: 0.14,
          content: dataUrl
        }
      ];
      setView('editor');
      commit(pages, next, currentPageIndex);
      setSelectedAnnotationId(next[next.length - 1].id);
    },
    [annotations, commit, currentPageIndex, pages]
  );

  const addText = useCallback(
    (text: string) => {
      const page = pages[currentPageIndex];
      if (!page) return;
      const next = [
        ...annotations,
        {
          id: generateId('ann'),
          pageId: page.id,
          type: 'text' as const,
          x: 0.12,
          y: 0.12,
          width: 0.46,
          height: 0.1,
          content: text,
          fontSize: 18,
          color: '#111111'
        }
      ];
      commit(pages, next, currentPageIndex);
      setSelectedAnnotationId(next[next.length - 1].id);
    },
    [annotations, commit, currentPageIndex, pages]
  );

  const updateAnnotation = useCallback(
    (id: string, patch: Partial<Annotation>) => {
      const next = annotations.map((item) => (item.id === id ? { ...item, ...patch } : item));
      commit(pages, next, currentPageIndex);
    },
    [annotations, commit, currentPageIndex, pages]
  );

  const deleteAnnotation = useCallback(
    (id: string) => {
      commit(
        pages,
        annotations.filter((item) => item.id !== id),
        currentPageIndex
      );
      setSelectedAnnotationId(null);
    },
    [annotations, commit, currentPageIndex, pages]
  );

  const undo = useCallback(() => {
    if (historyIndex <= 0) return;
    const snapshot = history[historyIndex - 1];
    setHistoryIndex(historyIndex - 1);
    setPages(snapshot.pages);
    setAnnotations(snapshot.annotations);
    setCurrentPageIndex(snapshot.currentPageIndex);
  }, [history, historyIndex]);

  const redo = useCallback(() => {
    if (historyIndex >= history.length - 1) return;
    const snapshot = history[historyIndex + 1];
    setHistoryIndex(historyIndex + 1);
    setPages(snapshot.pages);
    setAnnotations(snapshot.annotations);
    setCurrentPageIndex(snapshot.currentPageIndex);
  }, [history, historyIndex]);

  const value = useMemo<SessionApi>(
    () => ({
      view,
      fileName,
      docs,
      pages,
      annotations,
      currentPageIndex,
      selectedAnnotationId,
      pendingDoc,
      pendingPages,
      canUndo: historyIndex > 0,
      canRedo: historyIndex >= 0 && historyIndex < history.length - 1,
      goHome,
      openWebToPdf: () => setView('web-to-pdf'),
      openEditorFromFiles,
      setCurrentPage: setCurrentPageIndex,
      deleteCurrentPage,
      rotateCurrentPage,
      reorderPage,
      addBlankPage,
      addImagePages,
      startAddPdf,
      confirmAddPdf,
      cancelAddPdf,
      openSignature: () => setView('signature'),
      backToEditor: () => setView('editor'),
      addSignature,
      addText,
      updateAnnotation,
      deleteAnnotation,
      selectAnnotation: setSelectedAnnotationId,
      undo,
      redo,
      currentPage: pages[currentPageIndex] || null
    }),
    [
      addBlankPage,
      addImagePages,
      addSignature,
      addText,
      annotations,
      cancelAddPdf,
      confirmAddPdf,
      currentPageIndex,
      deleteAnnotation,
      deleteCurrentPage,
      docs,
      fileName,
      goHome,
      history.length,
      historyIndex,
      openEditorFromFiles,
      pages,
      pendingDoc,
      pendingPages,
      redo,
      reorderPage,
      rotateCurrentPage,
      selectedAnnotationId,
      startAddPdf,
      undo,
      updateAnnotation,
      view
    ]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePdfSession(): SessionApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('usePdfSession must be used within provider');
  return ctx;
}
