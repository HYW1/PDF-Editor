import { useMemo, useState } from 'react';
import { usePdfSession } from '../session/PdfSession';
import { PageCanvas } from '../ui/PageCanvas';

export function PageSelector() {
  const { pendingDoc, pendingPages, confirmAddPdf, cancelAddPdf } = usePdfSession();
  const [selected, setSelected] = useState<boolean[]>(() => pendingPages.map(() => true));
  const [position, setPosition] = useState<'before' | 'after'>('after');

  const docs = useMemo(
    () => (pendingDoc ? { [pendingDoc.id]: pendingDoc } : {}),
    [pendingDoc]
  );
  const count = selected.filter(Boolean).length;

  function toggle(index: number) {
    setSelected((prev) => prev.map((value, i) => (i === index ? !value : value)));
  }

  function toggleAll() {
    const next = count !== pendingPages.length;
    setSelected(pendingPages.map(() => next));
  }

  function insert() {
    const indices = selected.flatMap((value, index) => (value ? [index] : []));
    if (!indices.length) return;
    confirmAddPdf(indices, position);
  }

  return (
    <div className="subpage">
      <div className="topbar">
        <button className="ghost-btn" onClick={cancelAddPdf}>
          取消
        </button>
        <div className="file-name">{pendingDoc?.name || '选择页面'}</div>
        <button className="text-btn" onClick={toggleAll}>
          {count === pendingPages.length ? '取消全选' : '全选'}
        </button>
      </div>
      <div className="selector-grid">
        {pendingPages.map((page, index) => (
          <button
            key={page.id}
            className={`selector-item ${selected[index] ? 'selected' : ''}`}
            onClick={() => toggle(index)}
          >
            <PageCanvas page={page} docs={docs} maxWidth={140} />
            {selected[index] && <span className="check">✓</span>}
          </button>
        ))}
      </div>
      <div className="footer-bar">
        <div>
          <div>已选 {count} 页</div>
          <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
            <button
              className={position === 'before' ? 'primary-btn' : 'ghost-btn'}
              style={{ margin: 0, minHeight: 34, padding: '0 10px' }}
              onClick={() => setPosition('before')}
            >
              当前页之前
            </button>
            <button
              className={position === 'after' ? 'primary-btn' : 'ghost-btn'}
              style={{ margin: 0, minHeight: 34, padding: '0 10px' }}
              onClick={() => setPosition('after')}
            >
              当前页之后
            </button>
          </div>
        </div>
        <button className="primary-btn" style={{ margin: 0 }} onClick={insert} disabled={!count}>
          插入
        </button>
      </div>
    </div>
  );
}
