import type { UserQuota } from './types';

const STORAGE_KEY = 'pdf-helper-quota';
const DEFAULT_MAX_SIZE = 20 * 1024 * 1024;

export function getQuota(): UserQuota {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as UserQuota;
  } catch {
    /* ignore */
  }
  return {
    exportCount: 0,
    maxFileSize: DEFAULT_MAX_SIZE,
    unlocked: false,
    adWatched: false
  };
}

export function saveQuota(quota: UserQuota): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(quota));
}

export function canExport(): boolean {
  // Phase 1: always allow. Ads / paid unlock hook in later.
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

export function checkFileSize(size: number): boolean {
  return size <= getQuota().maxFileSize;
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
