const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('qhy', {
  /**
   * 触发一次单帧拍摄
   * @param {Object} options { exposureMs, width, height }
   */
  captureSingleFrame(options) {
    ipcRenderer.send('capture-single-frame', options);
  },
  /**
   * 接收单帧图像数据（ArrayBuffer）
   * @param {(payload: { width:number, height:number, bpp:number, channels:number, buffer:ArrayBuffer }) => void} cb
   */
  onFrameData(cb) {
    ipcRenderer.on('frame-data', (_event, payload) => {
      cb(payload);
    });
  },
  /**
   * 接收错误消息
   * @param {(error: string) => void} cb
   */
  onFrameError(cb) {
    ipcRenderer.on('frame-error', (_event, error) => {
      cb(error);
    });
  },
});
