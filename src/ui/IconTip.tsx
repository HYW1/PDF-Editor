import type { ReactNode } from 'react';

export function IconTip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="icon-tip" data-tip={label}>
      {children}
    </span>
  );
}
