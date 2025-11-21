document.addEventListener('DOMContentLoaded', async () => {
  const btn = document.getElementById('captureBtn');
  const statusEl = document.getElementById('status');
  const resultEl = document.getElementById('result');
  const expInput = document.getElementById('expMs');
  const gainSlider = document.getElementById('gainSlider');
  const offsetSlider = document.getElementById('offsetSlider');
  const gainValueEl = document.getElementById('gainValue');
  const offsetValueEl = document.getElementById('offsetValue');
  const exposureValueEl = document.getElementById('exposureValue');
  const exposureUnitToggle = document.getElementById('exposureUnitToggle');
  const imageContainer = document.getElementById('imageContainer');

  // 曝光单位：us / ms / s
  const exposureUnits = ['us', 'ms', 's'];
  let exposureUnitIndex = 1; // 默认 ms

  function getCurrentExposureUnit() {
    return exposureUnits[exposureUnitIndex] || 'ms';
  }

  function updateExposureUi() {
    if (!expInput || !exposureValueEl) return;
    const v = Number(expInput.value) || 0;
    const unit = getCurrentExposureUnit();
    exposureValueEl.textContent = `${v} ${unit}`;
    if (exposureUnitToggle) {
      exposureUnitToggle.textContent = unit;
    }
  }

  // 初始化滑杆显示
  if (gainSlider && gainValueEl) {
    const updateGainLabel = () => {
      const v = Number(gainSlider.value) || 0;
      gainValueEl.textContent = v > 0 ? `+${v}` : `${v}`;
    };
    gainSlider.addEventListener('input', updateGainLabel);
    updateGainLabel();
  }

  if (offsetSlider && offsetValueEl) {
    const updateOffsetLabel = () => {
      const v = Number(offsetSlider.value) || 0;
      offsetValueEl.textContent = `${v}`;
    };
    offsetSlider.addEventListener('input', updateOffsetLabel);
    updateOffsetLabel();
  }

  if (expInput && exposureValueEl) {
    expInput.addEventListener('input', updateExposureUi);
    updateExposureUi();
  }

  // 允许在右侧绿色文本中手动输入曝光时间（例如 100s / 500 ms / 20000us）
  function parseExposureText(text) {
    if (!text) return null;
    const m = text.trim().match(/^([\d.]+)\s*(us|ms|s)?$/i);
    if (!m) return null;
    const value = Number(m[1]);
    if (!Number.isFinite(value)) return null;
    const unit = m[2] ? m[2].toLowerCase() : null;
    return { value, unit };
  }

  function commitExposureFromText() {
    if (!expInput || !exposureValueEl) return;
    const parsed = parseExposureText(exposureValueEl.textContent || '');
    if (!parsed) {
      // 恢复为当前滑杆值
      updateExposureUi();
      return;
    }

    let { value, unit } = parsed;
    if (!Number.isFinite(value)) {
      updateExposureUi();
      return;
    }

    // 限制范围到 0-3600
    if (value < 0) value = 0;
    if (value > 3600) value = 3600;

    // 如果手动输入了单位，则切换当前单位
    const targetUnit = unit || getCurrentExposureUnit();
    const idx = exposureUnits.indexOf(targetUnit);
    if (idx >= 0) {
      exposureUnitIndex = idx;
    }

    expInput.value = String(value);
    updateExposureUi();
  }

  if (exposureValueEl) {
    // 按回车确认当前文本为曝光时间
    exposureValueEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commitExposureFromText();
        // 取消选中，避免换行
        exposureValueEl.blur();
      }
    });

    // 失焦时，恢复为标准显示（防止用户输了一半）
    exposureValueEl.addEventListener('blur', () => {
      updateExposureUi();
    });
  }

  if (exposureUnitToggle) {
    exposureUnitToggle.addEventListener('click', () => {
      exposureUnitIndex = (exposureUnitIndex + 1) % exposureUnits.length;
      updateExposureUi();
    });
  }

  // 离屏 canvas，用于从 16bit -> 8bit RGBA 并生成纹理
  const offscreenCanvas = document.createElement('canvas');
  const offscreenCtx = offscreenCanvas.getContext('2d');

  // 使用 PixiJS 在预览区域进行 GPU 加速渲染（Pixi v8 需要显式 init）
  const app = new PIXI.Application();
  await app.init({
    resizeTo: imageContainer,
    backgroundColor: 0x000000,
    antialias: false,
  });
  imageContainer.appendChild(app.canvas);

  const imageLayer = new PIXI.Container(); // 专门用于放图像的图层，方便缩放/平移
  app.stage.addChild(imageLayer);
  let imageSprite = null;             // 当前显示的图像精灵
  
  // 直方图相关元素
  const histogramCanvas = document.getElementById('histogramCanvas');
  const histCtx = histogramCanvas.getContext('2d');
  const histMinEl = document.getElementById('histMin');
  const histMaxEl = document.getElementById('histMax');
  const histMeanEl = document.getElementById('histMean');

  // 缩放控制相关元素
  const zoomInBtn = document.getElementById('zoomInBtn');
  const zoomOutBtn = document.getElementById('zoomOutBtn');
  const zoomResetBtn = document.getElementById('zoomResetBtn');
  const zoomLevelEl = document.getElementById('zoomLevel');
  const interpolationSelect = document.getElementById('interpolationSelect');

  // 缩放相关状态
  let currentZoom = 1.0;
  const zoomLevels = [0.1, 0.25, 0.5, 0.75, 1.0, 1.5, 2.0, 3.0, 4.0, 5.0];
  let currentZoomIndex = zoomLevels.indexOf(1.0);
  let offsetX = 0; // 画面平移 X 偏移（像素）
  let offsetY = 0; // 画面平移 Y 偏移（像素）
  let useInterpolation = true; // true: 插值缩放（线性），false: 不插值缩放（最近邻）

  /**
   * 获取当前应使用的 Pixi 缩放模式
   */
  function getScaleMode() {
    // 兼容性保护：如果 PIXI.SCALE_MODES 不存在，则不做处理
    if (!PIXI.SCALE_MODES) return null;
    return useInterpolation ? PIXI.SCALE_MODES.LINEAR : PIXI.SCALE_MODES.NEAREST;
  }

  /**
   * 将当前插值模式应用到已有的图像纹理上
   */
  function applyInterpolationMode() {
    const scaleMode = getScaleMode();
    if (!scaleMode || !imageSprite || !imageSprite.texture || !imageSprite.texture.baseTexture) {
      return;
    }
    imageSprite.texture.baseTexture.scaleMode = scaleMode;
    imageSprite.texture.baseTexture.update();
  }

  /**
   * 根据当前缩放和偏移，更新 Pixi 图层的变换
   */
  function updateCanvasTransform() {
    if (!imageLayer) return;
    imageLayer.position.set(offsetX, offsetY);
    imageLayer.scale.set(currentZoom);
  }

  /**
   * 更新缩放比例显示和按钮状态
   */
  function updateZoomDisplay() {
    zoomLevelEl.textContent = `${Math.round(currentZoom * 100)}%`;
    zoomOutBtn.disabled = currentZoomIndex <= 0;
    zoomInBtn.disabled = currentZoomIndex >= zoomLevels.length - 1;
  }

  /**
   * 应用缩放变换
   */
  function applyZoom() {
    updateCanvasTransform();
    updateZoomDisplay();
  }

  /**
   * 放大
   */
  function zoomIn() {
    if (currentZoomIndex < zoomLevels.length - 1) {
      currentZoomIndex++;
      currentZoom = zoomLevels[currentZoomIndex];
      applyZoom();
    }
  }

  /**
   * 缩小
   */
  function zoomOut() {
    if (currentZoomIndex > 0) {
      currentZoomIndex--;
      currentZoom = zoomLevels[currentZoomIndex];
      applyZoom();
    }
  }

  /**
   * 重置为1:1显示
   */
  function zoomReset() {
    currentZoomIndex = zoomLevels.indexOf(1.0);
    currentZoom = 1.0;
    applyZoom();
  }

  // 绑定缩放按钮事件
  zoomInBtn.addEventListener('click', zoomIn);
  zoomOutBtn.addEventListener('click', zoomOut);
  zoomResetBtn.addEventListener('click', zoomReset);

  // 插值 / 不插值 缩放切换
  if (interpolationSelect) {
    interpolationSelect.addEventListener('change', () => {
      // value: 'on' => 插值缩放；'off' => 不插值缩放
      useInterpolation = interpolationSelect.value === 'on';
      applyInterpolationMode();
    });
  }

  // 鼠标滚轮缩放（可选）
  imageContainer.addEventListener('wheel', (e) => {
    if (e.ctrlKey) {
      e.preventDefault();
      if (e.deltaY < 0) {
        zoomIn();
      } else {
        zoomOut();
      }
    }
  }, { passive: false });

  // 初始化
  updateZoomDisplay();

  /**
   * 图像拖拽平移（左键按下拖动，改变偏移量）
   */
  let isPanning = false;
  let startX = 0;
  let startY = 0;
  let startOffsetX = 0;
  let startOffsetY = 0;

  imageContainer.addEventListener('mousedown', (e) => {
    // 仅响应鼠标左键
    if (e.button !== 0) return;

    isPanning = true;
    imageContainer.classList.add('panning');

    startX = e.clientX;
    startY = e.clientY;
    startOffsetX = offsetX;
    startOffsetY = offsetY;

    // 避免选中文本等默认行为
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isPanning) return;

    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    offsetX = startOffsetX + dx;
    offsetY = startOffsetY + dy;
    updateCanvasTransform();

    e.preventDefault();
  });

  const stopPanning = () => {
    if (!isPanning) return;
    isPanning = false;
    imageContainer.classList.remove('panning');
  };

  document.addEventListener('mouseup', stopPanning);
  document.addEventListener('mouseleave', stopPanning);

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

    // 将 16bit 灰度拉伸到 8bit，并转换为 RGBA 缓冲区
    const rgba = new Uint8Array(count * 4);
    for (let i = 0; i < count; i += 1) {
      const v16 = pixels16[i];
      const norm = (v16 - min) / (max - min);
      const v8 = Math.max(0, Math.min(255, Math.round(norm * 255)));

      const idx = i * 4;
      rgba[idx] = v8;       // R
      rgba[idx + 1] = v8;   // G
      rgba[idx + 2] = v8;   // B
      rgba[idx + 3] = 255;  // A
    }

    // 将 RGBA 数据绘制到离屏 canvas，再交给 Pixi 生成纹理
    offscreenCanvas.width = width;
    offscreenCanvas.height = height;
    const clamped = new Uint8ClampedArray(rgba);
    const imageData = new ImageData(clamped, width, height);
    offscreenCtx.putImageData(imageData, 0, 0);

    const texture = PIXI.Texture.from(offscreenCanvas);
    const scaleMode = getScaleMode();
    if (scaleMode && texture.baseTexture) {
      texture.baseTexture.scaleMode = scaleMode;
    }

    if (imageSprite) {
      // 释放上一帧的纹理资源（不销毁底层 BaseTexture，以避免影响新纹理）
      imageSprite.texture.destroy(false);
      imageLayer.removeChild(imageSprite);
    }

    imageSprite = new PIXI.Sprite(texture);
    imageSprite.interactive = false;
    imageLayer.addChild(imageSprite);
    
    // 应用当前插值模式与缩放
    applyInterpolationMode();
    // 应用当前缩放
    applyZoom();
  }

  // 监听从主进程返回的帧数据（ArrayBuffer）
  window.qhy.onFrameData(({ width, height, bpp, channels, buffer }) => {
    statusEl.textContent = '拍摄成功，已收到图像数据';
    resultEl.textContent =
      `分辨率: ${width} x ${height}, bpp: ${bpp}, 通道数: ${channels}\n` +
      `字节长度: ${buffer.byteLength}\n` +
      `显示方式: 当前帧 16bit 灰度根据最小/最大值线性拉伸到 8bit`;

    console.log('接收到的像素缓冲区字节长度:', buffer.byteLength);

    // 先绘制直方图（即使后续 Pixi 渲染失败，统计信息也能正常显示）
    try {
      const pixels16 = new Uint16Array(buffer);
      drawHistogram(pixels16);
    } catch (e) {
      console.error('绘制直方图失败:', e);
    }

    try {
      renderFrame(buffer, width, height);
    } catch (e) {
      console.error('渲染图像失败:', e);
      resultEl.textContent += `\n渲染图像失败: ${e?.message || e}`;
    }
  });

  window.qhy.onFrameError((error) => {
    statusEl.textContent = '拍摄失败';
    resultEl.textContent = error || '未知错误';
  });

  function computeExposureUs() {
    if (!expInput) return 1000000; // 默认 1s
    const raw = Number(expInput.value) || 0;
    const unit = getCurrentExposureUnit();
    let us = 0;
    if (unit === 'us') {
      us = raw;
    } else if (unit === 'ms') {
      us = raw * 1000;
    } else {
      // s
      us = raw * 1000 * 1000;
    }
    if (us <= 0) us = 1; // 避免 0 曝光
    return us;
  }

  btn.addEventListener('click', () => {
    statusEl.textContent = '正在曝光并获取单帧图像，请稍候……';
    resultEl.textContent = '';

    const exposureUs = computeExposureUs();
    const exposureMs = exposureUs / 1000.0;
    const gain = gainSlider ? Number(gainSlider.value) || 0 : undefined;
    const offset = offsetSlider ? Number(offsetSlider.value) || 0 : undefined;

    window.qhy.captureSingleFrame({
      exposureMs,
      exposureUs,
      exposureUnit: getCurrentExposureUnit(),
      rawExposure: Number(expInput.value) || 0,
      width: 1920,
      height: 1080,
      gain,
      offset,
    });
  });
});
