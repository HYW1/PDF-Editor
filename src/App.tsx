import { lazy, Suspense } from 'react';
import { Home } from './pages/Home';
import { PdfSessionProvider, usePdfSession } from './session/PdfSession';

const Editor = lazy(async () => ({ default: (await import('./pages/Editor')).Editor }));
const Signature = lazy(async () => ({ default: (await import('./pages/Signature')).Signature }));
const PageSelector = lazy(async () => ({ default: (await import('./pages/PageSelector')).PageSelector }));
const WebToPdf = lazy(async () => ({ default: (await import('./pages/WebToPdf')).WebToPdf }));

function Screen() {
  const { view } = usePdfSession();
  if (view === 'editor') return <Editor />;
  if (view === 'signature') return <Signature />;
  if (view === 'page-selector') return <PageSelector />;
  if (view === 'web-to-pdf') return <WebToPdf />;
  return <Home />;
}

export function App() {
  return (
    <PdfSessionProvider>
      <div className="app-shell">
        <Suspense fallback={<div className="app-loading">正在打开…</div>}>
          <Screen />
        </Suspense>
      </div>
    </PdfSessionProvider>
  );
}
