App({
  globalData: {
    quota: {
      exportCount: 0,
      maxFileSize: 20 * 1024 * 1024, // 20MB
      unlocked: false,
      adWatched: false
    }
  },

  onLaunch() {
    const quota = wx.getStorageSync('userQuota');
    if (quota) {
      this.globalData.quota = quota;
    }
  },

  saveQuota() {
    wx.setStorageSync('userQuota', this.globalData.quota);
  }
});
