## webEZCAP - Electron + QHYCCD 单帧拍摄示例

本项目演示如何在 **Electron** 应用中通过 **Node 原生扩展（N-API）** 调用 **QHYCCD SDK**，实现单帧拍摄，并在前端对 16bit 灰度图像做简单拉伸后在 `canvas` 中预览。

与早期基于 `ffi-napi` 直接调用 DLL 的方案不同，本仓库采用 **C++ Addon + node-gyp** 方式封装 SDK，更适合与 Electron 长期维护和升级。

---

### 功能概览

- **单帧拍摄**：从 QHYCCD 相机获取一帧原始图像数据（16bit 灰度）。
- **前端预览**：渲染进程将 16bit 单通道数据按最小/最大值线性拉伸到 8bit，并在 `canvas` 中显示灰度图。
- **参数输入**：在界面中输入曝光时间（毫秒），可快速测试不同曝光下的图像效果。

---

### 目录结构

- `main.js`：Electron 主进程入口，创建窗口并响应 `capture-single-frame` IPC 事件，调用原生扩展完成拍摄。
- `preload.js`：通过 `contextBridge` 暴露 `window.qhy` API（`captureSingleFrame` / `onFrameData` / `onFrameError`）给渲染进程。
- `renderer.js`：页面逻辑，处理按钮点击事件，向主进程发起拍摄请求并接收返回的图像数据，在前端绘制。
- `index.html`：简单 UI 页面，包括曝光时间输入框、拍摄按钮、状态提示和 `canvas` 预览区域。
- `src/`：原生扩展的 C++ 实现，基于 QHYCCD SDK 采集图像：  
  - `qhyccd_addon.cpp`：N-API 导出接口，实现 `captureSingleFrame` 等方法。  
  - `qhyccd_dynamic.cpp/.h`：动态加载 `qhyccd.dll` 并封装底层调用。  
  - `qhyccd_sdk_wrapper.h`：对 SDK 接口的进一步封装（更易于在 Addon 中使用）。  
  - `stdint*.h`：用于在 Windows/MSVC 下补充标准整数类型定义。
- `sdk/`：随项目提供的 QHYCCD SDK 文件（Windows）：  
  - `include/`：SDK 头文件，如 `qhyccd.h`、`qhyccdstruct.h` 等。  
  - `x64/` / `x86/`：各自架构下的 `qhyccd.dll`、`qhyccd.lib`、`qhyccd.ini` 等二进制文件。  
  - `sample_codes/`：官方 C++ 示例（`SingleFrameSample.cpp` 等），可参考 SDK 原始调用方式。
- `binding.gyp`：node-gyp 构建配置，定义 `qhyccd_addon` 目标、源文件和链接的 `qhyccd.lib` 等。
- `bin/`：可能存在的额外二进制模块（如 `webEZCAP.node`），已在 `.gitignore` 中排除（构建产物）。

---

### 环境要求

- 操作系统：**Windows 10/11（64 位）**
- Node.js：建议 **LTS 版本（>= 18）**
- Electron：版本见 `package.json` 中的 `devDependencies.electron`
- C++ 工具链：
  - 已安装 **Visual Studio / Visual Studio Build Tools**，并启用 “使用 C++ 的桌面开发” 组件（含 MSVC、Windows SDK）。
  - Python（node-gyp 依赖，建议 3.x）。
- QHYCCD 相机驱动与固件：
  - 按照 QHY 官方文档安装相机驱动，确保相机在系统中能被 SDK 正常识别。

> 提示：项目自带 `sdk/` 目录中的 `qhyccd.dll` / `qhyccd.lib` 等文件，通常不再需要另行安装 SDK，但驱动必须按官方说明正确安装。

---

### 安装依赖

在项目根目录执行：

```bash
npm install
```

如遇到 `node-gyp` / MSBuild 相关错误，请检查：

- VS C++ 工具链是否安装完整（编译器、Windows SDK）。
- 是否在 **有权限的命令行** 中执行（避免路径或权限导致的构建失败）。
- Node 版本与 Electron/`node-gyp` 是否兼容（过旧或过新的版本都可能有问题）。

问题修复后，可删除 `build/` 目录，重新执行 `npm install`。

---

### 构建原生扩展

本项目使用 `node-gyp` + `binding.gyp` 构建 `qhyccd_addon.node`，构建命令已经写在 `package.json` 中：

```bash
# 在项目根目录执行
npm run build-addon
```

该命令会在 `build/Release/` 目录下生成：

- `qhyccd_addon.node`：Node 原生扩展模块
- 以及若干 `.pdb`、`.obj` 等中间文件（已在 `.gitignore` 中忽略）

如果你升级了 Electron 版本或 Node 版本，建议运行：

```bash
npm run rebuild
```

以重新使用 `electron-rebuild` 为当前 Electron 版本重建原生模块。

---

### 运行应用

完成依赖安装与扩展构建后，在项目根目录执行：

```bash
npm start
```

这会启动 Electron 应用，打开一个主窗口：

- 主进程入口：`main.js`
- 渲染进程脚本：`renderer.js`
- 预加载脚本：`preload.js`

---

### 使用说明

1. 启动应用后，界面上会看到：
   - 曝光时间输入框（单位：毫秒）；
   - “拍一张”按钮；
   - 状态文本和结果信息显示区；
   - 图像预览 `canvas`。
2. 输入期望的曝光时间（例如 `1000` 毫秒），点击“拍一张”。
3. 前端通过 `window.qhy.captureSingleFrame({ exposureMs, width, height })` 发送 IPC 到主进程。
4. 主进程调用 `qhyccd_addon.captureSingleFrame`：
   - 通过 QHYCCD SDK 控制相机曝光；
   - 获取 16bit 单通道灰度图像数据，并返回 `ArrayBuffer` 及宽、高、位深等信息。
5. 渲染进程收到 `onFrameData` 回调：
   - 在前端计算当前帧的 **最小值/最大值**；
   - 将每个像素从 \[min, max\] 映射到 \[0, 255\]；
   - 生成 RGBA 图像数据并绘制到 `canvas` 上进行预览；
   - 界面上显示分辨率、bpp、通道数、缓冲区长度等信息。
6. 如果拍摄或渲染过程中出现错误，`window.qhy.onFrameError` 会在界面上展示错误信息，同时主进程也会弹出错误对话框。

---

### 与 SDK 示例代码的关系

`sdk/sample_codes/` 下的 `SingleFrameSample.cpp`、`LiveFrameSample.cpp` 等文件展示了 **官方 C++ 调用 SDK 的方式**。  
本项目的 `src/` 目录中 C++ 代码在逻辑上与这些示例类似，但：

- 通过 N-API 封装为 Node 模块，供 JavaScript/TypeScript 调用；
- 对相机初始化、采集和关闭流程做了适当封装，便于在 Electron 主进程中使用；
- 通过 IPC 与渲染进程交互，实现 UI 与相机功能解耦。

如果你希望扩展更多功能（例如多帧连拍、实时预览、温度控制、滤镜轮控制等），推荐先阅读：

- `sdk/include/qhyccd.h` / `qhyccdstruct.h`
- `sdk/sample_codes/SingleFrameSample.cpp`
- 本项目 `src/qhyccd_addon.cpp`、`src/qhyccd_dynamic.cpp`

然后在现有 N-API 封装基础上增加新的导出函数，再由 `preload.js` 暴露给前端使用。

---

### 常见问题（FAQ）

- **Q：应用启动时报找不到 `qhyccd_addon.node`？**  
  **A**：确认已执行 `npm run build-addon` 或 `npm run rebuild`，并且构建成功生成 `build/Release/qhyccd_addon.node`。如仍出错，检查 `.node` 文件是否与当前 Electron/Node 版本 ABI 匹配（必要时删除 `build/` 重新构建）。

- **Q：相机无法识别 / 拍摄失败？**  
  **A**：检查 QHY 官方驱动是否安装、相机是否被系统识别（设备管理器中显示正常），以及你使用的 SDK 与相机型号是否兼容。必要时可先在官方 SDK 示例程序中验证相机是否可以正常采集。

- **Q：如何接入自己的 UI 或保存其他格式（如 PNG、FITS）？**  
  **A**：可以在 `renderer.js` 中拿到的 `ArrayBuffer` 基础上，使用前端图像库或在主进程中增加保存逻辑，例如通过 `sharp` / `fitsjs` 等第三方库进行格式转换和保存。

---

### 许可证

本项目本身使用 `ISC` 协议（见 `package.json`），QHYCCD SDK 的使用须遵守其官方授权与协议条款，请在商用前仔细阅读 QHY 官方文档。  

