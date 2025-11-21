const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');

let mainWindow = null;
let qhyAddon = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile('index.html');

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function loadAddon() {
  if (!qhyAddon) {
    // N-API Addon，链接 sdk/x64/qhyccd.lib/qhyccd.dll
    // 构建输出：build/Release/qhyccd_addon.node
    // 注意需先执行：npm run build-addon 或 npm run rebuild
    // 以匹配当前 Electron 版本
    // eslint-disable-next-line global-require
    qhyAddon = require('./build/Release/qhyccd_addon.node');
  }
}

app.whenReady().then(() => {
  createWindow();

  // 渲染进程发起拍摄请求（不通过 invoke 返回，而是通过 postMessage 零拷贝回传）
  ipcMain.on('capture-single-frame', (event, options) => {
    try {
      loadAddon();
      const res = qhyAddon.captureSingleFrame(options || {});
      const { data, width, height, bpp, channels } = res;

      // 直接通过结构化拷贝发送 ArrayBuffer
      // 某些 Electron 版本不支持在此处传 ArrayBuffer 作为 transfer 列表，会报
      // “Invalid value for transfer”，因此这里不再传第三个参数。
      event.senderFrame.postMessage('frame-data', {
        width,
        height,
        bpp,
        channels,
        buffer: data,
      });
    } catch (err) {
      console.error(err);
      dialog.showErrorBox('拍摄失败', String(err.message || err));
      event.senderFrame.postMessage('frame-error', String(err.message || err));
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
