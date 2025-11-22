/**
 * 测量绘制模块
 * 负责处理所有测量相关的绘制、交互和管理功能
 */

class MeasurementManager {
  constructor(options) {
    // 依赖注入
    this.imageContainer = options.imageContainer;
    this.measurementLayer = options.measurementLayer;
    this.app = options.app;
    this.getImageCoordsFromEvent = options.getImageCoordsFromEvent;
    this.getCurrentZoom = options.getCurrentZoom;
    this.imageSprite = options.imageSprite;

    // 测量模式常量
    this.MEASURE_MODES = {
      NONE: 'none',
      POINT: 'point',
      LINE: 'line',
      POLYLINE: 'polyline',
      ANGLE: 'angle',
      CIRCLE: 'circle',
      RECT: 'rect',
      ELLIPSE: 'ellipse',
      POLYGON: 'polygon',
      SELECT: 'select',
    };

    // 测量状态
    this.currentMeasureMode = this.MEASURE_MODES.NONE;
    this.defaultMeasurementColor = 0xe36209;
    this.measurements = [];
    this.activeMeasurement = null;
    this.selectedMeasurementId = null;
    this.hoverTarget = null;

    // 撤销/重做栈
    this.undoStack = [];
    this.redoStack = [];
    this.MAX_UNDO_STACK = 50;

    // 绘制状态
    this.isDrawingMeasurement = false;
    this.isDraggingControlPoint = false;
    this.dragTarget = null;

    // 悬停高亮图形
    this.hoverGraphics = new PIXI.Graphics();
    this.hoverGraphics.eventMode = 'none';
    this.hoverGraphics.zIndex = 9999;
    this.measurementLayer.addChild(this.hoverGraphics);

    // DOM 元素
    this.measurementToolbarEl = document.getElementById('measurementToolbar');
    this.measurementColorPicker = document.getElementById('measurementColorPicker');
    this.measurementVisibleToggle = document.getElementById('measurementVisibleToggle');
    this.clearMeasurementsBtn = document.getElementById('clearMeasurementsBtn');
    this.measurementListEl = document.getElementById('measurementList');
    this.measurementUndoBtn = document.getElementById('measurementUndoBtn');
    this.measurementRedoBtn = document.getElementById('measurementRedoBtn');
    this.measurementExportBtn = document.getElementById('measurementExportBtn');

    // 初始化
    this.init();
  }

  /**
   * 初始化测量系统
   */
  init() {
    this.initToolbar();
    this.initColorPicker();
    this.initButtons();
    this.initVisibilityToggle();
    this.initKeyboardShortcuts();
    this.setMeasureMode(this.MEASURE_MODES.NONE);
  }

  /**
   * 将当前测量模式映射为人类可读名称
   */
  getMeasureModeName(mode) {
    switch (mode) {
      case this.MEASURE_MODES.POINT: return '点';
      case this.MEASURE_MODES.LINE: return '线段';
      case this.MEASURE_MODES.POLYLINE: return '折线';
      case this.MEASURE_MODES.ANGLE: return '角度';
      case this.MEASURE_MODES.CIRCLE: return '圆';
      case this.MEASURE_MODES.RECT: return '矩形';
      case this.MEASURE_MODES.ELLIPSE: return '椭圆';
      case this.MEASURE_MODES.POLYGON: return '多边形';
      case this.MEASURE_MODES.SELECT: return '选择/编辑';
      default: return '关闭';
    }
  }

  /**
   * 设置当前测量模式，并更新按钮激活状态
   */
  setMeasureMode(mode) {
    this.currentMeasureMode = mode || this.MEASURE_MODES.NONE;

    if (this.measurementToolbarEl) {
      const buttons = this.measurementToolbarEl.querySelectorAll('.measure-btn[data-measure-mode]');
      buttons.forEach((btn) => {
        const btnMode = btn.getAttribute('data-measure-mode') || this.MEASURE_MODES.NONE;
        if (btnMode === this.currentMeasureMode) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });
    }

    // 切换模式时，取消当前正在绘制的图元预览
    this.activeMeasurement = null;

    // 更新图像容器的鼠标光标样式
    if (this.imageContainer) {
      if (this.currentMeasureMode === this.MEASURE_MODES.NONE) {
        this.imageContainer.classList.remove('measure-active');
      } else {
        this.imageContainer.classList.add('measure-active');
        this.imageContainer.classList.remove('panning');
      }
    }

    // 模式切换时清除悬停高亮
    this.updateHoverGraphics(null);
  }

  /**
   * 将当前测量集合序列化为可持久化的数据
   */
  serializeMeasurements() {
    return this.measurements.map((m) => ({
      id: m.id,
      type: m.type,
      name: m.name,
      points: (m.points || []).map((p) => ({ x: p.x, y: p.y })),
      color: typeof m.color === 'number' ? m.color : this.defaultMeasurementColor,
    }));
  }

  /**
   * 推入当前状态到撤销栈
   */
  pushUndoState() {
    const snapshot = this.serializeMeasurements();
    this.undoStack.push(snapshot);
    if (this.undoStack.length > this.MAX_UNDO_STACK) {
      this.undoStack.shift();
    }
    // 新操作后清空重做栈
    this.redoStack.length = 0;
  }

  /**
   * 从快照还原测量集合
   */
  restoreFromSnapshot(snapshot) {
    // 清理旧对象
    this.measurements.forEach((m) => {
      if (m.graphics && m.graphics.destroy) m.graphics.destroy();
      if (m.label && m.label.destroy) m.label.destroy();
    });
    this.measurements.length = 0;
    this.activeMeasurement = null;
    this.selectedMeasurementId = null;

    if (!snapshot || !Array.isArray(snapshot)) {
      this.refreshMeasurementList();
      return;
    }

    snapshot.forEach((data) => {
      const m = this.createMeasurement(data.type, { skipUndo: true });
      if (!m) return;
      m.id = data.id;
      m.name = data.name;
      m.points = (data.points || []).map((p) => ({ x: p.x, y: p.y }));
      m.color = typeof data.color === 'number' ? data.color : this.defaultMeasurementColor;
      this.updateMeasurementGraphics(m);
    });
    this.refreshMeasurementList();
  }

  undoMeasurement() {
    if (this.undoStack.length === 0) return;
    const snapshot = this.undoStack.pop();
    const current = this.serializeMeasurements();
    this.redoStack.push(current);
    this.restoreFromSnapshot(snapshot);
  }

  redoMeasurement() {
    if (this.redoStack.length === 0) return;
    const snapshot = this.redoStack.pop();
    const current = this.serializeMeasurements();
    this.undoStack.push(current);
    this.restoreFromSnapshot(snapshot);
  }

  /**
   * 根据测量对象生成列表中的显示名称
   */
  getMeasurementDisplayName(m, index) {
    const baseName = m.name || this.getMeasureModeName(m.type);
    return `${index + 1}. ${baseName}`;
  }

  /**
   * 刷新侧边测量对象列表
   */
  refreshMeasurementList() {
    if (!this.measurementListEl) return;
    this.measurementListEl.innerHTML = '';

    this.measurements.forEach((m, index) => {
      const row = document.createElement('div');
      row.className = 'measurement-item';
      row.dataset.id = m.id;

      const main = document.createElement('div');
      main.className = 'measurement-item-main';

      const nameEl = document.createElement('div');
      nameEl.className = 'measurement-item-name';
      nameEl.textContent = this.getMeasurementDisplayName(m, index);
      nameEl.contentEditable = 'true';

      const metricsEl = document.createElement('div');
      metricsEl.className = 'measurement-item-metrics';
      metricsEl.textContent = m.label && m.label.text ? m.label.text : '';

      main.appendChild(nameEl);
      main.appendChild(metricsEl);

      const actions = document.createElement('div');
      actions.className = 'measurement-item-actions';

      const visibleLabel = document.createElement('label');
      visibleLabel.style.display = 'inline-flex';
      visibleLabel.style.alignItems = 'center';
      visibleLabel.style.gap = '2px';
      const visibleCheckbox = document.createElement('input');
      visibleCheckbox.type = 'checkbox';
      visibleCheckbox.checked =
        (m.graphics ? m.graphics.visible : true) && (m.label ? m.label.visible : true);
      const visibleSpan = document.createElement('span');
      visibleSpan.textContent = 'On';
      visibleLabel.appendChild(visibleCheckbox);
      visibleLabel.appendChild(visibleSpan);

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.textContent = 'Del';

      actions.appendChild(visibleLabel);
      actions.appendChild(delBtn);

      row.appendChild(main);
      row.appendChild(actions);
      this.measurementListEl.appendChild(row);

      // 可编辑名称
      nameEl.addEventListener('blur', () => {
        const raw = nameEl.textContent || '';
        const trimmed = raw.trim();
        m.name = trimmed || this.getMeasureModeName(m.type);
        nameEl.textContent = this.getMeasurementDisplayName(m, index);
      });

      // 单击行：选中并高亮
      row.addEventListener('click', (event) => {
        if (event.target === visibleCheckbox || event.target === delBtn) return;
        this.selectedMeasurementId = m.id;
        this.measurements.forEach((mm) => {
          if (mm.graphics) {
            mm.graphics.alpha = mm.id === this.selectedMeasurementId ? 1.0 : 0.4;
          }
          if (mm.label) {
            mm.label.alpha = mm.id === this.selectedMeasurementId ? 1.0 : 0.4;
          }
        });
        // 列表选中时，同步更新颜色选择器显示
        if (this.measurementColorPicker && typeof m.color === 'number') {
          const hex = `#${m.color.toString(16).padStart(6, '0')}`;
          this.measurementColorPicker.value = hex;
        }
      });

      // 显示/隐藏单个测量
      visibleCheckbox.addEventListener('change', () => {
        const visible = !!visibleCheckbox.checked;
        if (m.graphics) m.graphics.visible = visible;
        if (m.label) m.label.visible = visible;
      });

      // 删除测量
      delBtn.addEventListener('click', () => {
        if (m.graphics && m.graphics.destroy) m.graphics.destroy();
        if (m.label && m.label.destroy) m.label.destroy();
        const idx = this.measurements.findIndex((mm) => mm.id === m.id);
        if (idx >= 0) {
          this.measurements.splice(idx, 1);
        }
        if (this.selectedMeasurementId === m.id) {
          this.selectedMeasurementId = null;
        }
        this.refreshMeasurementList();
      });
    });
  }

  /**
   * 创建一个新的测量对象，并挂载到测量图层
   */
  createMeasurement(type, options = {}) {
    if (!this.measurementLayer) return null;
    const graphics = new PIXI.Graphics();
    const label = new PIXI.Text('', {
      fontFamily: 'SFMono-Regular, Consolas, Menlo, monospace',
      fontSize: 11,
      fill: 0xffffff,
    });
    label.resolution = window.devicePixelRatio || 1;

    this.measurementLayer.addChild(graphics);
    this.measurementLayer.addChild(label);

    const measurement = {
      id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type,
      name: this.getMeasureModeName(type),
      points: [],
      graphics,
      label,
      color: this.defaultMeasurementColor,
    };

    // 让标签颜色跟随测量颜色
    if (measurement.label && measurement.label.style) {
      measurement.label.style.fill = measurement.color;
    }

    // 非还原场景下，推入撤销栈
    if (!options.skipUndo) {
      this.pushUndoState();
    }

    this.measurements.push(measurement);
    this.refreshMeasurementList();
    return measurement;
  }

  /**
   * 绘制虚线段，用于折线 / 多边形 / 角度的预览连线
   */
  drawDashedLine(g, x1, y1, x2, y2, dashLength = 8, gapLength = 4) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const distance = Math.hypot(dx, dy);
    if (distance === 0) return;

    const nx = dx / distance;
    const ny = dy / distance;

    let drawn = 0;
    let draw = true;
    let cx = x1;
    let cy = y1;

    g.moveTo(x1, y1);

    while (drawn < distance) {
      const segment = Math.min(
        draw ? dashLength : gapLength,
        distance - drawn,
      );
      cx += nx * segment;
      cy += ny * segment;

      if (draw) {
        g.lineTo(cx, cy);
      } else {
        g.moveTo(cx, cy);
      }

      drawn += segment;
      draw = !draw;
    }
  }

  /**
   * 根据测量对象内容重新绘制几何图形和文本
   */
  updateMeasurementGraphics(measurement) {
    if (!measurement || !measurement.graphics) return;
    const g = measurement.graphics;
    const pts = measurement.points;

    g.clear();

    // 每次重绘前，确保标签颜色与当前测量颜色一致
    if (measurement.label && measurement.label.style) {
      measurement.label.style.fill = measurement.color;
    }

    // 点坐标
    if (measurement.type === this.MEASURE_MODES.POINT && pts.length >= 1) {
      const p = pts[0];
      const r = 3;
      g.beginFill(measurement.color, 0.9);
      g.drawCircle(p.x, p.y, r);
      g.endFill();

      if (measurement.label) {
        measurement.label.text = `(${p.x.toFixed(1)}, ${p.y.toFixed(1)}) px`;
        measurement.label.x = p.x + 6;
        measurement.label.y = p.y - 12;
      }
      return;
    }

    // 直线距离（两点）
    if (measurement.type === this.MEASURE_MODES.LINE && pts.length >= 2) {
      const p0 = pts[0];
      const p1 = pts[1];
      g.moveTo(p0.x, p0.y);
      g.lineTo(p1.x, p1.y);

      const dx = p1.x - p0.x;
      const dy = p1.y - p0.y;
      const dist = Math.hypot(dx, dy);

      if (measurement.label) {
        measurement.label.text = `${dist.toFixed(2)} px`;
        measurement.label.x = (p0.x + p1.x) / 2 + 4;
        measurement.label.y = (p0.y + p1.y) / 2 - 14;
      }

      if (typeof g.stroke === 'function') {
        g.stroke({ width: 1, color: measurement.color, alpha: 1 });
      }
      return;
    }

    // 折线长度（多点）
    if (measurement.type === this.MEASURE_MODES.POLYLINE && pts.length >= 1) {
      let totalLength = 0;

      if (pts.length === 1) {
        if (measurement.previewPoint) {
          const p0 = pts[0];
          const pv = measurement.previewPoint;
          this.drawDashedLine(g, p0.x, p0.y, pv.x, pv.y);
          const segLen = Math.hypot(pv.x - p0.x, pv.y - p0.y);
          totalLength = segLen;

          if (measurement.label) {
            measurement.label.text = `L≈${segLen.toFixed(2)} px`;
            measurement.label.x = pv.x + 6;
            measurement.label.y = pv.y - 12;
          }

          if (typeof g.stroke === 'function') {
            g.stroke({ width: 1, color: measurement.color, alpha: 1 });
          }
        } else if (measurement.label) {
          measurement.label.text = '';
        }
        return;
      }

      g.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i += 1) {
        const pPrev = pts[i - 1];
        const p = pts[i];
        g.lineTo(p.x, p.y);
        totalLength += Math.hypot(p.x - pPrev.x, p.y - pPrev.y);
      }

      if (measurement.previewPoint) {
        const last = pts[pts.length - 1];
        this.drawDashedLine(g, last.x, last.y, measurement.previewPoint.x, measurement.previewPoint.y);
      }

      if (measurement.label) {
        const anchor = measurement.previewPoint || pts[pts.length - 1];
        measurement.label.text = `L=${totalLength.toFixed(2)} px`;
        measurement.label.x = anchor.x + 6;
        measurement.label.y = anchor.y - 12;
      }

      if (typeof g.stroke === 'function') {
        g.stroke({ width: 1, color: measurement.color, alpha: 1 });
      }
      return;
    }

    // 角度（三点）
    if (measurement.type === this.MEASURE_MODES.ANGLE) {
      if (pts.length === 1 && measurement.previewPoint) {
        const p0 = pts[0];
        const pv = measurement.previewPoint;
        this.drawDashedLine(g, p0.x, p0.y, pv.x, pv.y);

        if (typeof g.stroke === 'function') {
          g.stroke({ width: 1, color: measurement.color, alpha: 1 });
        }

        if (measurement.label) {
          measurement.label.text = '';
        }
        return;
      }

      if (pts.length < 2) {
        return;
      }

      const p0 = pts[0];
      const p1 = pts[1];
      const p2 = pts[2] || measurement.previewPoint;

      if (!p2) {
        g.moveTo(p1.x, p1.y);
        g.lineTo(p0.x, p0.y);

        if (measurement.previewPoint) {
          this.drawDashedLine(g, p1.x, p1.y, measurement.previewPoint.x, measurement.previewPoint.y);
        }

        if (typeof g.stroke === 'function') {
          g.stroke({ width: 1, color: measurement.color, alpha: 1 });
        }

        if (measurement.label) {
          measurement.label.text = '';
        }
        return;
      }

      g.moveTo(p1.x, p1.y);
      g.lineTo(p0.x, p0.y);
      g.moveTo(p1.x, p1.y);
      g.lineTo(p2.x, p2.y);

      const v1x = p0.x - p1.x;
      const v1y = p0.y - p1.y;
      const v2x = p2.x - p1.x;
      const v2y = p2.y - p1.y;
      const len1 = Math.hypot(v1x, v1y);
      const len2 = Math.hypot(v2x, v2y);
      let angleDeg = 0;
      if (len1 > 0 && len2 > 0) {
        const dot = v1x * v2x + v1y * v2y;
        const cosVal = Math.min(1, Math.max(-1, dot / (len1 * len2)));
        angleDeg = (Math.acos(cosVal) * 180) / Math.PI;
      }

      if (measurement.label) {
        measurement.label.text = `${angleDeg.toFixed(2)}°`;
        measurement.label.x = p1.x + 6;
        measurement.label.y = p1.y - 16;
      }

      if (typeof g.stroke === 'function') {
        g.stroke({ width: 1, color: measurement.color, alpha: 1 });
      }
      return;
    }

    // 圆（中心+圆上一点）
    if (measurement.type === this.MEASURE_MODES.CIRCLE && pts.length >= 2) {
      const c = pts[0];
      const edge = pts[1];
      const r = Math.hypot(edge.x - c.x, edge.y - c.y);

      g.drawCircle(c.x, c.y, r);

      const d = 2 * r;
      const perimeter = 2 * Math.PI * r;

      if (measurement.label) {
        measurement.label.text =
          `R=${r.toFixed(2)} px, D=${d.toFixed(2)} px, C=${perimeter.toFixed(2)} px`;
        measurement.label.x = c.x + r + 6;
        measurement.label.y = c.y - 12;
      }

      if (typeof g.stroke === 'function') {
        g.stroke({ width: 1, color: measurement.color, alpha: 1 });
      }
      return;
    }

    // 轴对齐矩形（两点确定对角）
    if (measurement.type === this.MEASURE_MODES.RECT && pts.length >= 2) {
      const p0 = pts[0];
      const p1 = pts[1];
      const x = Math.min(p0.x, p1.x);
      const y = Math.min(p0.y, p1.y);
      const w = Math.abs(p1.x - p0.x);
      const h = Math.abs(p1.y - p0.y);

      g.beginFill(measurement.color, 0.15);
      g.drawRect(x, y, w, h);
      g.endFill();

      const perimeter = 2 * (w + h);
      const area = w * h;

      if (measurement.label) {
        measurement.label.text =
          `W=${w.toFixed(2)} px, H=${h.toFixed(2)} px, P=${perimeter.toFixed(
            2,
          )} px, A=${area.toFixed(2)} px²`;
        measurement.label.x = x + w + 6;
        measurement.label.y = y - 12;
      }

      if (typeof g.stroke === 'function') {
        g.stroke({ width: 1, color: measurement.color, alpha: 1 });
      }
      return;
    }

    // 椭圆（两点确定外接矩形对角）
    if (measurement.type === this.MEASURE_MODES.ELLIPSE && pts.length >= 2) {
      const p0 = pts[0];
      const p1 = pts[1];
      const x = Math.min(p0.x, p1.x);
      const y = Math.min(p0.y, p1.y);
      const w = Math.abs(p1.x - p0.x);
      const h = Math.abs(p1.y - p0.y);
      const rx = w / 2;
      const ry = h / 2;
      const cx = x + rx;
      const cy = y + ry;

      g.beginFill(measurement.color, 0.15);
      g.drawEllipse(cx, cy, rx, ry);
      g.endFill();

      const area = Math.PI * rx * ry;
      const hShape = Math.pow(rx - ry, 2) / Math.pow(rx + ry, 2);
      const perimeter =
        Math.PI * (rx + ry) * (1 + (3 * hShape) / (10 + Math.sqrt(4 - 3 * hShape)));

      if (measurement.label) {
        measurement.label.text =
          `a=${rx.toFixed(2)} px, b=${ry.toFixed(2)} px, P≈${perimeter.toFixed(
            2,
          )} px, A=${area.toFixed(2)} px²`;
        measurement.label.x = cx + rx + 6;
        measurement.label.y = cy - 12;
      }

      if (typeof g.stroke === 'function') {
        g.stroke({ width: 1, color: measurement.color, alpha: 1 });
      }
      return;
    }

    // 多边形面积（任意多边形）
    if (measurement.type === this.MEASURE_MODES.POLYGON && pts.length >= 1) {
      if (pts.length === 1) {
        if (measurement.previewPoint) {
          const p0 = pts[0];
          const pv = measurement.previewPoint;
          this.drawDashedLine(g, p0.x, p0.y, pv.x, pv.y);

          if (typeof g.stroke === 'function') {
            g.stroke({ width: 1, color: measurement.color, alpha: 1 });
          }
        }
        if (measurement.label) {
          measurement.label.text = '';
        }
        return;
      }

      g.beginFill(measurement.color, 0.15);
      g.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i += 1) {
        g.lineTo(pts[i].x, pts[i].y);
      }
      if (pts.length >= 3) {
        g.closePath();
      }
      g.endFill();

      let perimeter = 0;
      let area = 0;

      if (pts.length >= 3) {
        for (let i = 0; i < pts.length; i += 1) {
          const p0 = pts[i];
          const p1 = pts[(i + 1) % pts.length];
          perimeter += Math.hypot(p1.x - p0.x, p1.y - p0.y);
        }

        let sum = 0;
        for (let i = 0; i < pts.length; i += 1) {
          const p0 = pts[i];
          const p1 = pts[(i + 1) % pts.length];
          sum += p0.x * p1.y - p1.x * p0.y;
        }
        area = Math.abs(sum) / 2;
      }

      if (measurement.previewPoint) {
        const last = pts[pts.length - 1];
        this.drawDashedLine(g, last.x, last.y, measurement.previewPoint.x, measurement.previewPoint.y);
      }

      if (measurement.label) {
        const anchor = measurement.previewPoint || pts[pts.length - 1];
        if (pts.length >= 3) {
          measurement.label.text = `P=${perimeter.toFixed(2)} px, A=${area.toFixed(2)} px²`;
        } else {
          const segLen = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
          measurement.label.text = `L=${segLen.toFixed(2)} px`;
        }
        measurement.label.x = anchor.x + 6;
        measurement.label.y = anchor.y - 12;
      }

      if (typeof g.stroke === 'function') {
        g.stroke({ width: 1, color: measurement.color, alpha: 1 });
      }
      return;
    }
  }

  /**
   * 更新悬停高亮效果
   */
  updateHoverGraphics(target) {
    this.hoverTarget = target || null;
    this.hoverGraphics.clear();

    if (!this.hoverTarget || !this.hoverTarget.point) return;

    const p = this.hoverTarget.point;

    this.hoverGraphics.circle(p.x, p.y, 5);
    this.hoverGraphics.moveTo(p.x - 6, p.y);
    this.hoverGraphics.lineTo(p.x + 6, p.y);
    this.hoverGraphics.moveTo(p.x, p.y - 6);
    this.hoverGraphics.lineTo(p.x, p.y + 6);

    if (typeof this.hoverGraphics.stroke === 'function') {
      this.hoverGraphics.stroke({ width: 1, color: 0xffffff, alpha: 0.9 });
    }
  }

  /**
   * 处理测量绘制相关的鼠标按下事件
   */
  handleMouseDown(e) {
    if (e.button !== 0) return;
    if (this.currentMeasureMode === this.MEASURE_MODES.NONE) return;

    const imgPos = this.getImageCoordsFromEvent(e);
    if (!imgPos) return;

    if (!this.imageSprite) return;

    // 选择模式：拖动控制点编辑
    if (this.currentMeasureMode === this.MEASURE_MODES.SELECT) {
      const currentZoom = this.getCurrentZoom();
      const hitRadius = 10 / currentZoom;
      for (let i = this.measurements.length - 1; i >= 0; i -= 1) {
        const m = this.measurements[i];
        const pts = m.points || [];
        for (let idx = 0; idx < pts.length; idx += 1) {
          const p = pts[idx];
          const dx = imgPos.x - p.x;
          const dy = imgPos.y - p.y;
          if (Math.hypot(dx, dy) <= hitRadius) {
            this.dragTarget = { measurement: m, pointIndex: idx };
            this.isDraggingControlPoint = true;
            return;
          }
        }
      }
      return;
    }

    // 点：单击一次即生成
    if (this.currentMeasureMode === this.MEASURE_MODES.POINT) {
      const m = this.createMeasurement(this.MEASURE_MODES.POINT);
      if (!m) return;
      m.points.push(imgPos);
      this.updateMeasurementGraphics(m);
      this.refreshMeasurementList();
      return;
    }

    // 拖拽型图元：线段 / 圆 / 矩形 / 椭圆
    if (
      this.currentMeasureMode === this.MEASURE_MODES.LINE ||
      this.currentMeasureMode === this.MEASURE_MODES.CIRCLE ||
      this.currentMeasureMode === this.MEASURE_MODES.RECT ||
      this.currentMeasureMode === this.MEASURE_MODES.ELLIPSE
    ) {
      this.activeMeasurement = this.createMeasurement(this.currentMeasureMode);
      if (!this.activeMeasurement) return;
      this.activeMeasurement.points.push({ x: imgPos.x, y: imgPos.y });
      this.activeMeasurement.points.push({ x: imgPos.x, y: imgPos.y });
      this.isDrawingMeasurement = true;
      this.updateMeasurementGraphics(this.activeMeasurement);
      return;
    }

    // 多点型图元：折线 / 多边形 / 角度
    if (
      this.currentMeasureMode === this.MEASURE_MODES.POLYLINE ||
      this.currentMeasureMode === this.MEASURE_MODES.POLYGON ||
      this.currentMeasureMode === this.MEASURE_MODES.ANGLE
    ) {
      if (!this.activeMeasurement || this.activeMeasurement.type !== this.currentMeasureMode) {
        this.activeMeasurement = this.createMeasurement(this.currentMeasureMode);
      }
      if (!this.activeMeasurement) return;

      this.activeMeasurement.previewPoint = null;
      this.activeMeasurement.points.push(imgPos);
      this.updateMeasurementGraphics(this.activeMeasurement);

      if (this.currentMeasureMode === this.MEASURE_MODES.ANGLE && this.activeMeasurement.points.length >= 3) {
        this.activeMeasurement = null;
        this.refreshMeasurementList();
      }
    }
  }

  /**
   * 处理测量绘制相关的鼠标移动事件
   */
  handleMouseMove(e) {
    const imgPos = this.getImageCoordsFromEvent(e);
    if (!imgPos) return;

    // SEL 模式：先处理悬停捕获与控制点拖拽
    if (this.currentMeasureMode === this.MEASURE_MODES.SELECT) {
      if (this.isDraggingControlPoint && this.dragTarget) {
        const { measurement, pointIndex } = this.dragTarget;
        if (measurement && measurement.points && measurement.points[pointIndex]) {
          measurement.points[pointIndex] = imgPos;
          this.updateMeasurementGraphics(measurement);
        }
        return;
      }

      const currentZoom = this.getCurrentZoom();
      const hitRadius = 10 / currentZoom;
      let best = null;
      let bestDist = hitRadius;

      for (let i = this.measurements.length - 1; i >= 0; i -= 1) {
        const m = this.measurements[i];
        const pts = m.points || [];
        for (let idx = 0; idx < pts.length; idx += 1) {
          const p = pts[idx];
          const dx = imgPos.x - p.x;
          const dy = imgPos.y - p.y;
          const dist = Math.hypot(dx, dy);
          if (dist <= bestDist) {
            bestDist = dist;
            best = { measurement: m, point: p, pointIndex: idx };
          }
        }
      }

      this.updateHoverGraphics(best);
      return;
    }

    // 多点型图元的预览
    if (
      this.activeMeasurement &&
      (this.currentMeasureMode === this.MEASURE_MODES.POLYLINE ||
        this.currentMeasureMode === this.MEASURE_MODES.POLYGON ||
        this.currentMeasureMode === this.MEASURE_MODES.ANGLE)
    ) {
      this.activeMeasurement.previewPoint = imgPos;
      this.updateMeasurementGraphics(this.activeMeasurement);
      return;
    }

    // 拖拽型图元的预览
    if (!this.isDrawingMeasurement || !this.activeMeasurement) return;

    const pts = this.activeMeasurement.points;
    if (pts.length >= 2) {
      pts[pts.length - 1] = imgPos;
    }
    this.activeMeasurement.previewPoint = null;
    this.updateMeasurementGraphics(this.activeMeasurement);
  }

  /**
   * 处理测量绘制相关的鼠标抬起事件
   */
  handleMouseUp() {
    if (this.isDrawingMeasurement && this.activeMeasurement) {
      this.updateMeasurementGraphics(this.activeMeasurement);
      this.activeMeasurement = null;
      this.refreshMeasurementList();
    }
    this.isDrawingMeasurement = false;

    if (this.isDraggingControlPoint) {
      this.isDraggingControlPoint = false;
      this.dragTarget = null;
    }
  }

  /**
   * 处理双击事件（结束折线/多边形绘制）
   */
  handleDoubleClick(e) {
    if (
      this.currentMeasureMode === this.MEASURE_MODES.POLYLINE ||
      this.currentMeasureMode === this.MEASURE_MODES.POLYGON
    ) {
      if (this.activeMeasurement) {
        this.updateMeasurementGraphics(this.activeMeasurement);
        this.activeMeasurement = null;
        this.refreshMeasurementList();
      }
      this.isDrawingMeasurement = false;
      e.preventDefault();
    }
  }

  /**
   * 处理右键菜单事件（结束折线/多边形绘制）
   */
  handleContextMenu(e) {
    if (this.currentMeasureMode === this.MEASURE_MODES.SELECT && this.isDraggingControlPoint) {
      this.isDraggingControlPoint = false;
      this.dragTarget = null;
      e.preventDefault();
      return;
    }

    if (
      this.currentMeasureMode === this.MEASURE_MODES.POLYLINE ||
      this.currentMeasureMode === this.MEASURE_MODES.POLYGON
    ) {
      if (this.activeMeasurement && this.activeMeasurement.points.length >= 2) {
        if (
          this.currentMeasureMode === this.MEASURE_MODES.POLYGON &&
          this.activeMeasurement.points.length < 3
        ) {
          this.activeMeasurement.graphics.destroy();
          this.activeMeasurement.label.destroy();
        } else {
          this.activeMeasurement.previewPoint = null;
          this.updateMeasurementGraphics(this.activeMeasurement);
        }
        this.activeMeasurement = null;
        this.refreshMeasurementList();
      }
      this.isDrawingMeasurement = false;
      e.preventDefault();
    }
  }

  /**
   * 清除所有测量
   */
  clearAllMeasurements() {
    this.pushUndoState();
    this.measurements.forEach((m) => {
      if (m.graphics && m.graphics.destroy) m.graphics.destroy();
      if (m.label && m.label.destroy) m.label.destroy();
    });
    this.measurements.length = 0;
    this.activeMeasurement = null;
    this.selectedMeasurementId = null;
    this.refreshMeasurementList();
  }

  /**
   * 初始化测量工具栏按钮
   */
  initToolbar() {
    if (!this.measurementToolbarEl) return;
    const buttons = this.measurementToolbarEl.querySelectorAll('.measure-btn[data-measure-mode]');
    buttons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const mode = btn.getAttribute('data-measure-mode') || this.MEASURE_MODES.NONE;
        if (mode === this.currentMeasureMode) {
          this.setMeasureMode(this.MEASURE_MODES.NONE);
        } else {
          this.setMeasureMode(mode);
        }
      });
    });
  }

  /**
   * 初始化颜色选择器
   */
  initColorPicker() {
    if (!this.measurementColorPicker) return;
    const initialHex = `#${this.defaultMeasurementColor.toString(16).padStart(6, '0')}`;
    this.measurementColorPicker.value = initialHex;

    this.measurementColorPicker.addEventListener('input', () => {
      const hex = this.measurementColorPicker.value;
      const match = /^#([0-9a-fA-F]{6})$/.exec(hex);
      if (!match) return;
      const colorVal = parseInt(match[1], 16);
      if (!Number.isFinite(colorVal)) return;

      this.defaultMeasurementColor = colorVal;

      if (this.selectedMeasurementId) {
        const m = this.measurements.find((mm) => mm.id === this.selectedMeasurementId);
        if (m) {
          m.color = colorVal;
          this.updateMeasurementGraphics(m);
          this.refreshMeasurementList();
          return;
        }
      }
    });
  }

  /**
   * 初始化按钮事件
   */
  initButtons() {
    if (this.measurementUndoBtn) {
      this.measurementUndoBtn.addEventListener('click', () => {
        this.undoMeasurement();
      });
    }

    if (this.measurementRedoBtn) {
      this.measurementRedoBtn.addEventListener('click', () => {
        this.redoMeasurement();
      });
    }

    if (this.measurementExportBtn) {
      this.measurementExportBtn.addEventListener('click', () => {
        const resultEl = document.getElementById('result');
        const statusEl = document.getElementById('status');
        if (!resultEl) return;
        const data = this.serializeMeasurements();
        try {
          resultEl.textContent = JSON.stringify(data, null, 2);
          statusEl.textContent = '已导出测量数据（JSON）';
        } catch (err) {
          resultEl.textContent = `导出测量数据失败: ${err?.message || err}`;
        }
      });
    }

    if (this.clearMeasurementsBtn) {
      this.clearMeasurementsBtn.addEventListener('click', () => {
        this.clearAllMeasurements();
      });
    }
  }

  /**
   * 初始化显示/隐藏切换
   */
  initVisibilityToggle() {
    if (this.measurementVisibleToggle && this.measurementLayer) {
      this.measurementVisibleToggle.addEventListener('change', () => {
        this.measurementLayer.visible = this.measurementVisibleToggle.checked;
      });
    }
  }

  /**
   * 初始化键盘快捷键
   */
  initKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        this.undoMeasurement();
      } else if (e.ctrlKey && (e.key === 'y' || e.key === 'Y')) {
        e.preventDefault();
        this.redoMeasurement();
      }
    });
  }

  /**
   * 更新 imageSprite 引用（当图像更新时调用）
   */
  updateImageSprite(imageSprite) {
    this.imageSprite = imageSprite;
  }
}

