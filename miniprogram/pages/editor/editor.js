const fileUtil = require('../../utils/file');
const { generateId } = require('../../utils/id');

Page({
  data: {
    fileName: '',
    filePath: '',
    pages: [],
    annotations: [],
    currentPageIndex: 0,
    showAddMenu: false,
    canUndo: false,
    canRedo: false,
    previewWidth: 600,
    previewHeight: 800,
    thumbW: 90,
    thumbH: 120
  },

  pdfDoc: null,
  pdfLib: null,
  history: [],
  historyIndex: -1,

  onLoad(options) {
    const filePath = decodeURIComponent(options.filePath || '');
    const fileName = decodeURIComponent(options.fileName || 'untitled.pdf');
    this.setData({ filePath, fileName });
    this.loadPDFLib().then(() => {
      if (filePath) this.loadPDF(filePath);
    });
  },

  async loadPDFLib() {
    if (this.pdfLib) return;
    this.pdfLib = require('../../libs/pdf-lib.min.js');
  },

  async loadPDF(filePath) {
    try {
      wx.showLoading({ title: '加载中...' });
      const data = await fileUtil.readFile(filePath);
      const { PDFDocument } = this.pdfLib;
      this.pdfDoc = await PDFDocument.load(data);
      this.buildPageList();
      this.saveHistory('load');
      wx.hideLoading();
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: '无法打开此PDF', icon: 'none' });
      console.error('loadPDF error', e);
    }
  },

  buildPageList() {
    if (!this.pdfDoc) return;
    const count = this.pdfDoc.getPageCount();
    const pages = [];
    for (let i = 0; i < count; i++) {
      const page = this.pdfDoc.getPage(i);
      const { width, height } = page.getSize();
      const rotation = page.getRotation().angle;
      pages.push({
        id: generateId(),
        source: 'original',
        sourcePageIndex: i,
        width,
        height,
        rotation,
        thumbnail: ''
      });
    }

    const first = pages[0] || { width: 595, height: 842 };
    const maxW = 600;
    const ratio = first.height / first.width;
    const previewHeight = Math.round(maxW * ratio);

    this.setData({
      pages,
      previewWidth: maxW,
      previewHeight: previewHeight > 900 ? 900 : previewHeight,
      thumbH: Math.round(this.data.thumbW * ratio)
    });

    this.renderThumbnails();
  },

  renderThumbnails() {
    // Placeholder: render page number in thumbnail canvas
    // Real PDF rendering requires pdf.js adaptation which will be done in step 5
    const pages = this.data.pages;
    pages.forEach((page, i) => {
      this.renderThumbPlaceholder(i, page);
    });
  },

  renderThumbPlaceholder(index, page) {
    const query = this.createSelectorQuery();
    query.select(`#thumb-canvas-${index}`)
      .fields({ node: true, size: true })
      .exec((res) => {
        if (!res[0] || !res[0].node) return;
        const canvas = res[0].node;
        const ctx = canvas.getContext('2d');
        const dpr = wx.getWindowInfo().pixelRatio;
        canvas.width = res[0].width * dpr;
        canvas.height = res[0].height * dpr;
        ctx.scale(dpr, dpr);

        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, res[0].width, res[0].height);

        ctx.fillStyle = '#ccc';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${index + 1}`, res[0].width / 2, res[0].height / 2);

        if (page.rotation) {
          ctx.fillStyle = '#4361ee';
          ctx.font = '8px sans-serif';
          ctx.fillText(`${page.rotation}°`, res[0].width / 2, res[0].height / 2 + 14);
        }
      });
  },

  onSwiperChange(e) {
    this.setData({ currentPageIndex: e.detail.current });
  },

  onThumbTap(e) {
    const index = e.currentTarget.dataset.index;
    this.setData({ currentPageIndex: index });
  },

  onThumbLongPress(e) {
    const index = e.currentTarget.dataset.index;
    this.setData({ currentPageIndex: index });
    wx.showActionSheet({
      itemList: ['删除此页', '向左移动', '向右移动'],
      success: (res) => {
        if (res.tapIndex === 0) this.deletePage(index);
        else if (res.tapIndex === 1) this.movePage(index, index - 1);
        else if (res.tapIndex === 2) this.movePage(index, index + 1);
      }
    });
  },

  // Page operations
  onDeletePage() {
    const idx = this.data.currentPageIndex;
    if (this.data.pages.length <= 1) {
      wx.showToast({ title: '至少保留一页', icon: 'none' });
      return;
    }
    this.deletePage(idx);
  },

  deletePage(index) {
    if (this.data.pages.length <= 1) return;
    this.pdfDoc.removePage(index);
    this.buildPageList();
    const newIndex = Math.min(index, this.data.pages.length - 1);
    this.setData({ currentPageIndex: newIndex });
    this.saveHistory('delete');
  },

  movePage(from, to) {
    const count = this.data.pages.length;
    if (to < 0 || to >= count) {
      wx.showToast({ title: '无法移动', icon: 'none' });
      return;
    }
    // pdf-lib doesn't have movePage, we need to rebuild
    // For now, swap using removePage + insertPage approach
    // This is complex with pdf-lib, we'll implement properly in step 6
    wx.showToast({ title: '排序功能开发中', icon: 'none' });
  },

  onRotatePage() {
    const idx = this.data.currentPageIndex;
    const page = this.pdfDoc.getPage(idx);
    const current = page.getRotation().angle;
    const newRotation = (current + 90) % 360;
    page.setRotation(this.pdfLib.degrees(newRotation));
    this.buildPageList();
    this.saveHistory('rotate');
  },

  // Add menu
  onShowAddMenu() {
    this.setData({ showAddMenu: true });
  },

  onHideAddMenu() {
    this.setData({ showAddMenu: false });
  },

  async onAddImage() {
    this.setData({ showAddMenu: false });
    try {
      const files = await fileUtil.chooseFile('image');
      if (!files || !files.length) return;
      wx.showLoading({ title: '处理中...' });

      const currentPage = this.pdfDoc.getPage(this.data.currentPageIndex);
      const { width: pageW, height: pageH } = currentPage.getSize();

      for (const file of files) {
        const imgData = await fileUtil.readFile(file.path);
        const isJpg = /\.(jpg|jpeg)$/i.test(file.name || file.path);
        const img = isJpg
          ? await this.pdfDoc.embedJpg(imgData)
          : await this.pdfDoc.embedPng(imgData);

        const imgW = img.width;
        const imgH = img.height;

        // contain mode: fit within page, keep ratio
        const scaleX = pageW / imgW;
        const scaleY = pageH / imgH;
        const scale = Math.min(scaleX, scaleY);
        const drawW = imgW * scale;
        const drawH = imgH * scale;
        const x = (pageW - drawW) / 2;
        const y = (pageH - drawH) / 2;

        const newPage = this.pdfDoc.insertPage(this.data.currentPageIndex + 1, [pageW, pageH]);
        newPage.drawImage(img, { x, y, width: drawW, height: drawH });
      }

      this.buildPageList();
      this.setData({ currentPageIndex: this.data.currentPageIndex + 1 });
      this.saveHistory('addImage');
      wx.hideLoading();
    } catch (e) {
      wx.hideLoading();
      console.error('addImage error', e);
      wx.showToast({ title: '添加图片失败', icon: 'none' });
    }
  },

  async onAddPDF() {
    this.setData({ showAddMenu: false });
    try {
      const files = await fileUtil.chooseFile('file', ['pdf']);
      if (!files || !files.length) return;
      wx.showLoading({ title: '处理中...' });

      const data = await fileUtil.readFile(files[0].path);
      const { PDFDocument } = this.pdfLib;
      const srcDoc = await PDFDocument.load(data);
      const srcPageCount = srcDoc.getPageCount();
      const indices = Array.from({ length: srcPageCount }, (_, i) => i);
      const copiedPages = await this.pdfDoc.copyPages(srcDoc, indices);

      const insertAt = this.data.currentPageIndex + 1;
      copiedPages.forEach((page, i) => {
        this.pdfDoc.insertPage(insertAt + i, page);
      });

      this.buildPageList();
      this.setData({ currentPageIndex: insertAt });
      this.saveHistory('addPDF');
      wx.hideLoading();
    } catch (e) {
      wx.hideLoading();
      console.error('addPDF error', e);
      wx.showToast({ title: '添加PDF失败', icon: 'none' });
    }
  },

  onAddBlank() {
    this.setData({ showAddMenu: false });
    const currentPage = this.pdfDoc.getPage(this.data.currentPageIndex);
    const { width, height } = currentPage.getSize();
    this.pdfDoc.insertPage(this.data.currentPageIndex + 1, [width, height]);
    this.buildPageList();
    this.setData({ currentPageIndex: this.data.currentPageIndex + 1 });
    this.saveHistory('addBlank');
  },

  // Signature
  onSignature() {
    wx.navigateTo({
      url: '/pages/signature/signature',
      events: {
        onSignatureComplete: (data) => {
          this.addSignatureToPage(data.imagePath);
        }
      }
    });
  },

  addSignatureToPage(imagePath) {
    const pageId = this.data.pages[this.data.currentPageIndex].id;
    const annotations = [...this.data.annotations];
    annotations.push({
      id: generateId(),
      pageId,
      type: 'signature',
      x: 0.2,
      y: 0.6,
      width: 0.3,
      height: 0.15,
      content: imagePath
    });
    this.setData({ annotations });
    this.saveHistory('addSignature');
  },

  // Text
  onAddText() {
    wx.showModal({
      title: '添加文字',
      editable: true,
      placeholderText: '请输入文字内容',
      success: (res) => {
        if (res.confirm && res.content) {
          const pageId = this.data.pages[this.data.currentPageIndex].id;
          const annotations = [...this.data.annotations];
          annotations.push({
            id: generateId(),
            pageId,
            type: 'text',
            x: 0.1,
            y: 0.1,
            width: 0.4,
            height: 0.08,
            content: res.content,
            fontSize: 14,
            color: '#000000'
          });
          this.setData({ annotations });
          this.saveHistory('addText');
        }
      }
    });
  },

  onAnnotationTap(e) {
    const annId = e.currentTarget.dataset.id;
    wx.showActionSheet({
      itemList: ['删除'],
      success: (res) => {
        if (res.tapIndex === 0) {
          const annotations = this.data.annotations.filter(a => a.id !== annId);
          this.setData({ annotations });
          this.saveHistory('deleteAnnotation');
        }
      }
    });
  },

  // Export
  async onExport() {
    try {
      wx.showLoading({ title: '导出中...' });

      // Embed annotations into PDF before export
      await this.embedAnnotations();

      const pdfBytes = await this.pdfDoc.save();
      const fileName = `pdf_helper_${Date.now()}.pdf`;
      const filePath = `${wx.env.USER_DATA_PATH}/${fileName}`;

      const fs = wx.getFileSystemManager();
      fs.writeFileSync(filePath, pdfBytes.buffer, 'binary');

      wx.hideLoading();

      wx.showActionSheet({
        itemList: ['预览', '分享', '保存到手机'],
        success: (res) => {
          if (res.tapIndex === 0) {
            wx.openDocument({ filePath, fileType: 'pdf' });
          } else if (res.tapIndex === 1) {
            wx.shareFileMessage({ filePath, fileName });
          } else if (res.tapIndex === 2) {
            wx.saveFileToPermanentStorage({
              filePath,
              success: () => wx.showToast({ title: '已保存' }),
              fail: () => {
                wx.openDocument({ filePath, fileType: 'pdf' });
              }
            });
          }
        }
      });
    } catch (e) {
      wx.hideLoading();
      console.error('export error', e);
      wx.showToast({ title: '导出失败', icon: 'none' });
    }
  },

  async embedAnnotations() {
    const { PDFDocument } = this.pdfLib;
    const annotations = this.data.annotations;
    const pages = this.data.pages;

    for (const ann of annotations) {
      const pageIndex = pages.findIndex(p => p.id === ann.pageId);
      if (pageIndex < 0) continue;
      const page = this.pdfDoc.getPage(pageIndex);
      const { width, height } = page.getSize();

      if (ann.type === 'text') {
        page.drawText(ann.content, {
          x: ann.x * width,
          y: height - ann.y * height - (ann.fontSize || 14),
          size: ann.fontSize || 14,
        });
      } else if (ann.type === 'signature') {
        try {
          const imgData = await fileUtil.readFile(ann.content);
          const img = await this.pdfDoc.embedPng(imgData);
          page.drawImage(img, {
            x: ann.x * width,
            y: height - ann.y * height - ann.height * height,
            width: ann.width * width,
            height: ann.height * height,
          });
        } catch (e) {
          console.error('embed signature error', e);
        }
      }
    }
  },

  // History (undo/redo)
  saveHistory(action) {
    // Simplified: save PDF bytes snapshot for undo/redo
    // Full implementation with efficient snapshots in step 11
    this.history = this.history.slice(0, this.historyIndex + 1);
    this.history.push({
      action,
      annotations: JSON.parse(JSON.stringify(this.data.annotations))
    });
    this.historyIndex = this.history.length - 1;
    this.setData({
      canUndo: this.historyIndex > 0,
      canRedo: false
    });
  },

  onUndo() {
    if (this.historyIndex <= 0) return;
    this.historyIndex--;
    const snapshot = this.history[this.historyIndex];
    this.setData({
      annotations: snapshot.annotations,
      canUndo: this.historyIndex > 0,
      canRedo: true
    });
  },

  onRedo() {
    if (this.historyIndex >= this.history.length - 1) return;
    this.historyIndex++;
    const snapshot = this.history[this.historyIndex];
    this.setData({
      annotations: snapshot.annotations,
      canUndo: true,
      canRedo: this.historyIndex < this.history.length - 1
    });
  },

  onBack() {
    wx.navigateBack();
  }
});
