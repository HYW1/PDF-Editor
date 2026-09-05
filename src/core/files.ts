export function pickFiles(accept: string, multiple = false): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = multiple;
    input.onchange = () => resolve(Array.from(input.files || []));
    input.click();
  });
}

export function safeDownloadName(fileName: string): string {
  const cleaned = fileName.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim();
  return cleaned || 'export.pdf';
}

export function bytesToBlob(bytes: Uint8Array, mime: string): Blob {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new Blob([copy], { type: mime });
}

export function downloadBytes(bytes: Uint8Array, fileName: string, mime = 'application/pdf') {
  const blob = bytesToBlob(bytes, mime);
  const name = safeDownloadName(fileName);
  const nav = window.navigator as Navigator & {
    msSaveOrOpenBlob?: (data: Blob, file: string) => void;
  };
  if (typeof nav.msSaveOrOpenBlob === 'function') {
    nav.msSaveOrOpenBlob(blob, name);
    return blob;
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.rel = 'noopener';
  link.target = '_blank';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  window.setTimeout(() => {
    link.remove();
    URL.revokeObjectURL(url);
  }, 60_000);
  return blob;
}

export function openBytes(bytes: Uint8Array, mime = 'application/pdf') {
  const blob = bytesToBlob(bytes, mime);
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener,noreferrer');
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return blob;
}
