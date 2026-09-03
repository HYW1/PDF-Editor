const fileUtil = require('../../utils/file');

Page({
  onEditPDF() {
    fileUtil.chooseFile('file', ['pdf']).then(files => {
      if (!files || !files.length) return;
      const file = files[0];
      wx.navigateTo({
        url: `/pages/editor/editor?filePath=${encodeURIComponent(file.path)}&fileName=${encodeURIComponent(file.name)}`
      });
    }).catch(() => {});
  },

  onMergePDF() {
    fileUtil.chooseFile('file', ['pdf']).then(files => {
      if (!files || !files.length) return;
      const file = files[0];
      wx.navigateTo({
        url: `/pages/editor/editor?filePath=${encodeURIComponent(file.path)}&fileName=${encodeURIComponent(file.name)}`
      });
    }).catch(() => {});
  },

  onWebToPDF() {
    wx.showToast({ title: '即将推出', icon: 'none' });
  }
});
