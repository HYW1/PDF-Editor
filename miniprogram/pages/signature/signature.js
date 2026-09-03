Page({
  data: {
    hasDrawn: false
  },

  canvas: null,
  ctx: null,
  drawing: false,
  lastX: 0,
  lastY: 0,

  onReady() {
    const query = this.createSelectorQuery();
    query.select('#sig-canvas')
      .fields({ node: true, size: true })
      .exec((res) => {
        if (!res[0]) return;
        const canvas = res[0].node;
        const ctx = canvas.getContext('2d');
        const dpr = wx.getWindowInfo().pixelRatio;
        canvas.width = res[0].width * dpr;
        canvas.height = res[0].height * dpr;
        ctx.scale(dpr, dpr);
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = '#000';
        this.canvas = canvas;
        this.ctx = ctx;
        this.canvasWidth = res[0].width;
        this.canvasHeight = res[0].height;
      });
  },

  onTouchStart(e) {
    const touch = e.touches[0];
    this.drawing = true;
    this.lastX = touch.x;
    this.lastY = touch.y;
    this.setData({ hasDrawn: true });
  },

  onTouchMove(e) {
    if (!this.drawing || !this.ctx) return;
    const touch = e.touches[0];
    this.ctx.beginPath();
    this.ctx.moveTo(this.lastX, this.lastY);
    this.ctx.lineTo(touch.x, touch.y);
    this.ctx.stroke();
    this.lastX = touch.x;
    this.lastY = touch.y;
  },

  onTouchEnd() {
    this.drawing = false;
  },

  onClear() {
    if (!this.ctx) return;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.setData({ hasDrawn: false });
  },

  onConfirm() {
    if (!this.data.hasDrawn) {
      wx.showToast({ title: '请先签名', icon: 'none' });
      return;
    }

    const tempPath = `${wx.env.USER_DATA_PATH}/signature_${Date.now()}.png`;
    wx.canvasToTempFilePath({
      canvas: this.canvas,
      fileType: 'png',
      success: (res) => {
        const fs = wx.getFileSystemManager();
        fs.copyFile({
          srcPath: res.tempFilePath,
          destPath: tempPath,
          success: () => {
            const eventChannel = this.getOpenerEventChannel();
            eventChannel.emit('onSignatureComplete', { imagePath: tempPath });
            wx.navigateBack();
          },
          fail: () => {
            const eventChannel = this.getOpenerEventChannel();
            eventChannel.emit('onSignatureComplete', { imagePath: res.tempFilePath });
            wx.navigateBack();
          }
        });
      },
      fail: (err) => {
        console.error('canvasToTempFilePath error', err);
        wx.showToast({ title: '保存签名失败', icon: 'none' });
      }
    });
  },

  onCancel() {
    wx.navigateBack();
  }
});
