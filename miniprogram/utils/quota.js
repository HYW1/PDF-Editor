const app = getApp();

function getQuota() {
  return app.globalData.quota;
}

function canExport() {
  const q = getQuota();
  return q.unlocked || q.exportCount < 3;
}

function recordExport() {
  const q = getQuota();
  q.exportCount++;
  app.saveQuota();
}

function unlockWithAd() {
  const q = getQuota();
  q.adWatched = true;
  q.unlocked = true;
  app.saveQuota();
}

function checkFileSize(size) {
  const q = getQuota();
  return size <= q.maxFileSize;
}

module.exports = { getQuota, canExport, recordExport, unlockWithAd, checkFileSize };
