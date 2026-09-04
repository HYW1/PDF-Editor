/** @typedef {{ text: string, x: number, y: number, width: number, height: number, fontSize: number }} TextItem */

/**
 * Merge nearby PDF.js glyphs into clickable lines (normalized 0–1 boxes).
 * @param {TextItem[]} items
 */
export function groupTextItems(items) {
  const usable = items
    .filter((item) => item.text.trim())
    .sort((a, b) => (Math.abs(a.y - b.y) > 0.004 ? a.y - b.y : a.x - b.x));
  const lines = [];
  for (const item of usable) {
    const current = lines[lines.length - 1];
    const last = current?.[current.length - 1];
    const sameLine =
      last &&
      Math.abs(item.y - last.y) < Math.max(item.height, last.height) * 0.55 &&
      item.x <= last.x + last.width + Math.max(item.height, last.height) * 1.4;
    if (sameLine && current) current.push(item);
    else lines.push([item]);
  }
  return lines.map((group) => {
    const x = Math.min(...group.map((item) => item.x));
    const y = Math.min(...group.map((item) => item.y));
    const right = Math.max(...group.map((item) => item.x + item.width));
    const bottom = Math.max(...group.map((item) => item.y + item.height));
    const text = group.map((item) => item.text).join('');
    const fontSize = Math.max(...group.map((item) => item.fontSize));
    const padX = Math.min(0.012, Math.max(0.004, (right - x) * 0.06));
    const padY = Math.min(0.01, Math.max(0.003, (bottom - y) * 0.18));
    const nx = Math.max(0, x - padX);
    const ny = Math.max(0, y - padY);
    return {
      id: `${nx.toFixed(3)}:${ny.toFixed(3)}:${text}`,
      text,
      x: nx,
      y: ny,
      width: Math.min(1 - nx, right - x + padX * 2),
      height: Math.min(1 - ny, bottom - y + padY * 2),
      fontSize
    };
  });
}
