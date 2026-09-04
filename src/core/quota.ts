import type { UserQuota } from './types';

const STORAGE_KEY = 'pdf-helper-quota';

export function getQuota(): UserQuota {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as UserQuota;
      if (parsed.maxFileSize === 20 * 1024 * 1024) parsed.maxFileSize = 0;
      return parsed;
    }
  } catch {
    /* ignore */
  }
  return {
    exportCount: 0,
    maxFileSize: 0,
    unlocked: false,
    adWatched: false
  };
}

export function saveQuota(quota: UserQuota): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(quota));
}

export const AD_SECONDS = 5;

export function canExport(): boolean {
  return true;
}

export function compressNeedsAd(): boolean {
  return true;
}

export function recordExport(): UserQuota {
  const quota = getQuota();
  quota.exportCount += 1;
  saveQuota(quota);
  return quota;
}

export function unlockWithAd(): UserQuota {
  const quota = getQuota();
  quota.adWatched = true;
  quota.unlocked = true;
  saveQuota(quota);
  return quota;
}

export function checkFileSize(_size: number): boolean {
  const max = getQuota().maxFileSize;
  if (!max || max <= 0) return true;
  return _size <= max;
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
