const fs = wx.getFileSystemManager();

function readFile(filePath) {
  return new Promise((resolve, reject) => {
    fs.readFile({
      filePath,
      success: (res) => resolve(res.data),
      fail: reject
    });
  });
}

function writeFile(filePath, data) {
  return new Promise((resolve, reject) => {
    fs.writeFile({
      filePath,
      data,
      encoding: 'binary',
      success: () => resolve(filePath),
      fail: reject
    });
  });
}

function writeTempFile(name, data) {
  const path = `${wx.env.USER_DATA_PATH}/${name}`;
  return writeFile(path, data);
}

function chooseFile(type, extension) {
  return new Promise((resolve, reject) => {
    wx.chooseMessageFile({
      count: type === 'image' ? 9 : 1,
      type: type === 'image' ? 'image' : 'file',
      extension: extension || (type === 'image' ? ['jpg', 'jpeg', 'png', 'bmp', 'gif'] : ['pdf']),
      success: (res) => resolve(res.tempFiles),
      fail: reject
    });
  });
}

function getFileName(path) {
  const parts = path.split('/');
  return parts[parts.length - 1];
}

module.exports = { readFile, writeFile, writeTempFile, chooseFile, getFileName };
