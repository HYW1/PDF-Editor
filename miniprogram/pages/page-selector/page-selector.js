Page({
  data: {
    pages: [],
    allSelected: true,
    selectedCount: 0
  },

  onLoad(options) {
    const pageCount = parseInt(options.pageCount || '0');
    const pages = [];
    for (let i = 0; i < pageCount; i++) {
      pages.push({ index: i, selected: true });
    }
    this.setData({
      pages,
      allSelected: true,
      selectedCount: pageCount
    });
  },

  onTogglePage(e) {
    const idx = e.currentTarget.dataset.index;
    const pages = this.data.pages;
    pages[idx].selected = !pages[idx].selected;
    const selectedCount = pages.filter(p => p.selected).length;
    this.setData({
      pages,
      selectedCount,
      allSelected: selectedCount === pages.length
    });
  },

  onToggleAll() {
    const newVal = !this.data.allSelected;
    const pages = this.data.pages.map(p => ({ ...p, selected: newVal }));
    this.setData({
      pages,
      allSelected: newVal,
      selectedCount: newVal ? pages.length : 0
    });
  },

  onInsert() {
    const selected = this.data.pages
      .filter(p => p.selected)
      .map(p => p.index);
    if (selected.length === 0) {
      wx.showToast({ title: '请选择至少一页', icon: 'none' });
      return;
    }
    const eventChannel = this.getOpenerEventChannel();
    eventChannel.emit('onPagesSelected', { indices: selected });
    wx.navigateBack();
  }
});
