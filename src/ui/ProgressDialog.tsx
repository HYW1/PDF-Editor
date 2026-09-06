interface ProgressDialogProps {
  title: string;
  done: number;
  total: number;
}

export function ProgressDialog({ title, done, total }: ProgressDialogProps) {
  const safeTotal = Math.max(total, 1);
  const pct = Math.min(100, Math.max(4, Math.round((done / safeTotal) * 100)));
  return (
    <div className="progress-mask" role="alertdialog" aria-live="polite" aria-busy="true">
      <div className="progress-card">
        <div className="progress-title">{title}</div>
        <div className="progress-track">
          <div
            className="progress-bar"
            style={{
              width: `${pct}%`,
              transition: done >= safeTotal ? 'none' : 'width 160ms linear'
            }}
          />
        </div>
        <div className="progress-meta">
          {done} / {safeTotal}
        </div>
        <p className="progress-hint">请稍等，页数多会多花一点时间</p>
      </div>
    </div>
  );
}
