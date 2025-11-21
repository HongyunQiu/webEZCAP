// 动态加载 QHYCCD SDK 的最小封装，只暴露本项目需要的接口。
// 通过 LoadLibrary/GetProcAddress 调用 qhyccd.dll，避免直接包含 qhyccd.h
// 从而绕开 SDK 头文件在 MSVC/C++ 下的各种编译兼容性问题。

#ifndef QHYCCD_DYNAMIC_H
#define QHYCCD_DYNAMIC_H

#include <stdint.h>
#include <windows.h>

// 与 SDK 中的 typedef 保持一致：typedef void qhyccd_handle;
typedef void qhyccd_handle;

// 这里只定义当前 addon 用到的控制 ID，值来自 sdk/include/qhyccdstruct.h
static const int QHYCCD_CONTROL_EXPOSURE = 8; // CONTROL_EXPOSURE

struct QHYCCDFunctions {
  HMODULE dll;

  uint32_t (__stdcall *InitQHYCCDResource)(void);
  uint32_t (__stdcall *ReleaseQHYCCDResource)(void);
  uint32_t (__stdcall *ScanQHYCCD)(void);
  uint32_t (__stdcall *GetQHYCCDId)(uint32_t index, char *id);
  qhyccd_handle * (__stdcall *OpenQHYCCD)(char *id);
  uint32_t (__stdcall *CloseQHYCCD)(qhyccd_handle *handle);
  uint32_t (__stdcall *SetQHYCCDStreamMode)(qhyccd_handle *handle, uint8_t mode);
  uint32_t (__stdcall *InitQHYCCD)(qhyccd_handle *handle);
  uint32_t (__stdcall *SetQHYCCDBinMode)(qhyccd_handle *handle, uint32_t wbin, uint32_t hbin);
  uint32_t (__stdcall *SetQHYCCDResolution)(qhyccd_handle *handle,
                                            uint32_t x,
                                            uint32_t y,
                                            uint32_t xsize,
                                            uint32_t ysize);
  uint32_t (__stdcall *SetQHYCCDParam)(qhyccd_handle *handle, int controlId, double value);
  uint32_t (__stdcall *ExpQHYCCDSingleFrame)(qhyccd_handle *handle);
  uint32_t (__stdcall *GetQHYCCDMemLength)(qhyccd_handle *handle);
  uint32_t (__stdcall *GetQHYCCDSingleFrame)(qhyccd_handle *handle,
                                             uint32_t *w,
                                             uint32_t *h,
                                             uint32_t *bpp,
                                             uint32_t *channels,
                                             uint8_t *imgdata);
};

// 加载 qhyccd.dll，并解析本结构体中的全部函数指针。
// dllPath 为空时默认从系统搜索路径中加载 "qhyccd.dll"。
bool LoadQHYCCDLibrary(QHYCCDFunctions *fns, const wchar_t *dllPath = L"qhyccd.dll");

// 卸载 DLL，并清空函数指针。
void UnloadQHYCCDLibrary(QHYCCDFunctions *fns);

#endif // QHYCCD_DYNAMIC_H


