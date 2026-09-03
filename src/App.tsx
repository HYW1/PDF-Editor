import { Editor } from './pages/Editor';
import { Home } from './pages/Home';
import { PageSelector } from './pages/PageSelector';
import { Signature } from './pages/Signature';
import { WebToPdf } from './pages/WebToPdf';
import { PdfSessionProvider, usePdfSession } from './session/PdfSession';

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
        <Screen />
      </div>
    </PdfSessionProvider>
  );
}
