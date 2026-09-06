import type { ChangeEvent, ReactNode } from 'react';

interface FilePickProps {
  accept: string;
  multiple?: boolean;
  className?: string;
  label: string;
  children: ReactNode;
  onFiles: (files: File[]) => void;
}

export function FilePick({ accept, multiple, className, label, children, onFiles }: FilePickProps) {
  function onChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (files.length) onFiles(files);
  }

  return (
    <label className={className}>
      <input
        type="file"
        accept={accept}
        multiple={multiple}
        className="file-pick-input"
        aria-label={label}
        onChange={onChange}
      />
      {children}
    </label>
  );
}
