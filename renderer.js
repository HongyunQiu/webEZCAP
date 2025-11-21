document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('captureBtn');
  const statusEl = document.getElementById('status');
  const resultEl = document.getElementById('result');
  const expInput = document.getElementById('expMs');
  const canvas = document.getElementById('previewCanvas');
  const ctx = canvas.getContext('2d');
  
  // 直方图相关元素
  const histogramCanvas = document.getElementById('histogramCanvas');
  const histCtx = histogramCanvas.getContext('2d');
  const histMinEl = document.getElementById('histMin');
  const histMaxEl = document.getElementById('histMax');
  const histMeanEl = document.getElementById('histMean');

  /**
   * 绘制直方图
   * @param {Uint16Array} pixels16 16bit 像素数据
   */
  function drawHistogram(pixels16) {
    if (!histCtx || !pixels16 || pixels16.length === 0) return;

    // 设置 canvas 大小
    const width = histogramCanvas.clientWidth;
    const height = histogramCanvas.clientHeight;
    histogramCanvas.width = width;
    histogramCanvas.height = height;

    // 计算直方图（分成256个区间）
    const bins = 256;
    const histogram = new Array(bins).fill(0);
    let min = 0xffff;
    let max = 0;
    let sum = 0;

    for (let i = 0; i < pixels16.length; i++) {
      const val = pixels16[i];
      if (val < min) min = val;
      if (val > max) max = val;
      sum += val;
      
      // 将 16bit 值映射到 256 个区间
      const binIndex = Math.floor((val / 65535) * (bins - 1));
      histogram[binIndex]++;
    }

    const mean = Math.round(sum / pixels16.length);

    // 更新统计信息
    histMinEl.textContent = `Min: ${min}`;
    histMaxEl.textContent = `Max: ${max}`;
    histMeanEl.textContent = `Mean: ${mean}`;

    // 找到最大频率用于归一化
    const maxCount = Math.max(...histogram);
    if (maxCount === 0) return;

    // 清空画布
    histCtx.fillStyle = '#0d1117';
    histCtx.fillRect(0, 0, width, height);

    // 绘制网格线
    histCtx.strokeStyle = '#30363d';
    histCtx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = (height / 4) * i;
      histCtx.beginPath();
      histCtx.moveTo(0, y);
      histCtx.lineTo(width, y);
      histCtx.stroke();
    }

    // 绘制直方图柱状图
    const barWidth = width / bins;
    histCtx.fillStyle = '#8b949e';
    
    for (let i = 0; i < bins; i++) {
      const barHeight = (histogram[i] / maxCount) * (height - 4);
      const x = i * barWidth;
      const y = height - barHeight;
      histCtx.fillRect(x, y, Math.max(barWidth, 1), barHeight);
    }
  }

  /**
   * 将 16bit 单通道灰度数据拉伸到 8bit，并绘制到 canvas 上
   * @param {ArrayBuffer} buffer 原始像素缓冲区（16bit little-endian）
   * @param {number} width
   * @param {number} height
   */
  function renderFrame(buffer, width, height) {
    if (!ctx) return;

    const pixels16 = new Uint16Array(buffer);
    const count = width * height;
    if (pixels16.length < count) {
      console.warn('像素数据长度不足：', pixels16.length, '预期：', count);
      return;
    }

    // 简单线性拉伸：根据当前帧的 min/max 映射到 0-255
    let min = 0xffff;
    let max = 0;
    for (let i = 0; i < count; i += 1) {
      const v = pixels16[i];
      if (v < min) min = v;
      if (v > max) max = v;
    }
    if (max === min) {
      max = min + 1; // 避免除零
    }

    canvas.width = width;
    canvas.height = height;

    const imageData = ctx.createImageData(width, height);
    const data = imageData.data; // Uint8ClampedArray, RGBA

    for (let i = 0; i < count; i += 1) {
      const v16 = pixels16[i];
      const norm = (v16 - min) / (max - min);
      const v8 = Math.max(0, Math.min(255, Math.round(norm * 255)));

      const idx = i * 4;
      data[idx] = v8; // R
      data[idx + 1] = v8; // G
      data[idx + 2] = v8; // B
      data[idx + 3] = 255; // A
    }

    ctx.putImageData(imageData, 0, 0);
    
    // 绘制直方图
    drawHistogram(pixels16);
  }

  // 监听从主进程返回的帧数据（ArrayBuffer）
  window.qhy.onFrameData(({ width, height, bpp, channels, buffer }) => {
    statusEl.textContent = '拍摄成功，已收到图像数据';
    resultEl.textContent =
      `分辨率: ${width} x ${height}, bpp: ${bpp}, 通道数: ${channels}\n` +
      `字节长度: ${buffer.byteLength}\n` +
      `显示方式: 当前帧 16bit 灰度根据最小/最大值线性拉伸到 8bit`;

    console.log('接收到的像素缓冲区字节长度:', buffer.byteLength);

    try {
      renderFrame(buffer, width, height);
    } catch (e) {
      console.error('渲染图像失败:', e);
    }
  });

  window.qhy.onFrameError((error) => {
    statusEl.textContent = '拍摄失败';
    resultEl.textContent = error || '未知错误';
  });

  btn.addEventListener('click', () => {
    statusEl.textContent = '正在曝光并获取单帧图像，请稍候……';
    resultEl.textContent = '';

    const exposureMs = Number(expInput.value) || 1000;
    window.qhy.captureSingleFrame({
      exposureMs,
      width: 1920,
      height: 1080,
    });
  });
});
