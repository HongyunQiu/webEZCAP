// 使用动态加载方式调用 QHYCCD SDK，避免直接依赖 qhyccd.h
#include "qhyccd_dynamic.h"

#include <node_api.h>
#include <cassert>
#include <cstdlib>
#include <cstring>
#include <windows.h>
#include <shlwapi.h>

#pragma comment(lib, "shlwapi.lib")

// 简单的 N-API 宏包装，方便断言
#define NAPI_CALL(env, call)                                      \
  do {                                                            \
    napi_status status = (call);                                  \
    if (status != napi_ok) {                                      \
      const napi_extended_error_info* error_info;                 \
      napi_get_last_error_info((env), &error_info);               \
      const char* msg = (error_info && error_info->error_message) \
                            ? error_info->error_message           \
                            : "N-API call failed";                \
      napi_throw_error((env), NULL, msg);                         \
      return NULL;                                                \
    }                                                             \
  } while (0)

static void finalize_buffer(napi_env env, void* finalize_data, void* finalize_hint) {
  (void)env;
  (void)finalize_hint;
  if (finalize_data) {
    free(finalize_data);
  }
}

// captureSingleFrame(options)
static napi_value CaptureSingleFrame(napi_env env, napi_callback_info info) {
  napi_status status;
  size_t argc = 1;
  napi_value args[1];
  NAPI_CALL(env, napi_get_cb_info(env, info, &argc, args, NULL, NULL));

  uint32_t exposureMs = 1000;
  double gain = -1.0;
  double offset = -1.0;
  uint32_t roiWidth = 1920;
  uint32_t roiHeight = 1080;

  if (argc >= 1) {
    napi_valuetype type;
    NAPI_CALL(env, napi_typeof(env, args[0], &type));
    if (type == napi_object) {
      napi_value v;
      if (napi_get_named_property(env, args[0], "exposureMs", &v) == napi_ok) {
        napi_get_value_uint32(env, v, &exposureMs);
      }
      if (napi_get_named_property(env, args[0], "exposureUs", &v) == napi_ok) {
        napi_get_value_double(env, v, &exposureUs);
      }
      if (napi_get_named_property(env, args[0], "gain", &v) == napi_ok) {
        napi_get_value_double(env, v, &gain);
      }
      if (napi_get_named_property(env, args[0], "offset", &v) == napi_ok) {
        napi_get_value_double(env, v, &offset);
      }
      if (napi_get_named_property(env, args[0], "width", &v) == napi_ok) {
        napi_get_value_uint32(env, v, &roiWidth);
      }
      if (napi_get_named_property(env, args[0], "height", &v) == napi_ok) {
        napi_get_value_uint32(env, v, &roiHeight);
      }
    }
  }

  static QHYCCDFunctions qhy = {};
  static bool qhy_loaded = false;
  if (!qhy_loaded) {
    // 获取当前模块路径，构建 sdk/x64/qhyccd.dll 的完整路径
    wchar_t modulePath[MAX_PATH] = {0};
    HMODULE hModule = NULL;
    GetModuleHandleExW(GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS | GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT,
                       (LPCWSTR)&CaptureSingleFrame, &hModule);
    if (hModule) {
      if (GetModuleFileNameW(hModule, modulePath, MAX_PATH) > 0) {
        // 移除文件名 (qhyccd_addon.node)，得到 build/Release 目录
        PathRemoveFileSpecW(modulePath);
        // 移除 Release，得到 build 目录
        PathRemoveFileSpecW(modulePath);
        // 移除 build，得到项目根目录
        PathRemoveFileSpecW(modulePath);
        // 构建 sdk/x64/qhyccd.dll 路径
        PathAppendW(modulePath, L"sdk");
        PathAppendW(modulePath, L"x64");
        PathAppendW(modulePath, L"qhyccd.dll");
      } else {
        // 如果获取模块路径失败，使用相对路径
        wcscpy_s(modulePath, MAX_PATH, L"sdk\\x64\\qhyccd.dll");
      }
    } else {
      // 如果获取模块句柄失败，使用相对路径
      wcscpy_s(modulePath, MAX_PATH, L"sdk\\x64\\qhyccd.dll");
    }
    
    if (!LoadQHYCCDLibrary(&qhy, modulePath)) {
      napi_throw_error(env, NULL, "Failed to load qhyccd.dll or resolve QHYCCD functions");
      return NULL;
    }
    qhy_loaded = true;
  }

  uint32_t ret = qhy.InitQHYCCDResource();
  if (ret != 0) {
    napi_throw_error(env, NULL, "InitQHYCCDResource failed");
    return NULL;
  }

  qhyccd_handle* handle = NULL;

  // 为了避免 MSVC 关于 goto 跳过初始化的编译错误（C2362），
  // 将后面需要在 fail/fail_no_free 标签后仍然在作用域中的变量
  // 统一提前声明。
  double exposureUs = 0.0;

  uint32_t w = 0;
  uint32_t h = 0;
  uint32_t bpp = 0;
  uint32_t channels = 0;
  uint32_t memLength = 0;
  size_t bufferSize = 0;
  uint8_t* buf = NULL;
  size_t bytesPerPixel = 0;
  uint32_t ch = 0;
  size_t usedBytes = 0;
  void* array_data = NULL;
  napi_value arraybuffer;

  uint32_t camCount = qhy.ScanQHYCCD();
  if (camCount == 0) {
    qhy.ReleaseQHYCCDResource();
    napi_throw_error(env, NULL, "No QHYCCD camera found");
    return NULL;
  }

  char camId[64];
  memset(camId, 0, sizeof(camId));
  ret = qhy.GetQHYCCDId(0, camId);
  if (ret != 0) {
    qhy.ReleaseQHYCCDResource();
    napi_throw_error(env, NULL, "GetQHYCCDId failed");
    return NULL;
  }

  handle = qhy.OpenQHYCCD(camId);
  if (handle == NULL) {
    qhy.ReleaseQHYCCDResource();
    napi_throw_error(env, NULL, "OpenQHYCCD failed");
    return NULL;
  }

  ret = qhy.SetQHYCCDStreamMode(handle, 0);
  if (ret != 0) goto fail;

  ret = qhy.InitQHYCCD(handle);
  if (ret != 0) goto fail;

  ret = qhy.SetQHYCCDBinMode(handle, 1, 1);
  if (ret != 0) goto fail;

  ret = qhy.SetQHYCCDResolution(handle, 0, 0, roiWidth, roiHeight);
  if (ret != 0) goto fail;

  // 曝光时间（单位：微秒）
  if (exposureUs <= 0.0) {
    exposureUs = (double)exposureMs * 1000.0;
  }
  ret = qhy.SetQHYCCDParam(handle, QHYCCD_CONTROL_EXPOSURE, exposureUs);
  if (ret != 0) goto fail;

  // 增益和偏置（如果提供）
  if (gain >= 0.0) {
    ret = qhy.SetQHYCCDParam(handle, QHYCCD_CONTROL_GAIN, gain);
    if (ret != 0) goto fail;
  }
  if (offset >= 0.0) {
    ret = qhy.SetQHYCCDParam(handle, QHYCCD_CONTROL_OFFSET, offset);
    if (ret != 0) goto fail;
  }

  ret = qhy.ExpQHYCCDSingleFrame(handle);
  if (ret != 0) goto fail;

  w = 0;
  h = 0;
  bpp = 0;
  channels = 0;

  memLength = qhy.GetQHYCCDMemLength(handle);
  bufferSize = memLength > 0 ? (size_t)memLength : (size_t)roiWidth * roiHeight * 2;
  buf = (uint8_t*)malloc(bufferSize);
  if (buf == NULL) {
    goto fail;
  }

  ret = qhy.GetQHYCCDSingleFrame(handle, &w, &h, &bpp, &channels, buf);
  if (ret != 0) {
    free(buf);
    goto fail;
  }

  if (w == 0 || h == 0 || bpp == 0) {
    free(buf);
    goto fail;
  }

  bytesPerPixel = (bpp + 7u) / 8u;
  if (bytesPerPixel == 0) {
    bytesPerPixel = 1;
  }
  ch = channels == 0 ? 1u : channels;
  usedBytes = (size_t)w * (size_t)h * bytesPerPixel * (size_t)ch;
  if (usedBytes > bufferSize) {
    usedBytes = bufferSize;
  }

  // 改用普通 ArrayBuffer，避免 external arraybuffer 在部分 Node/Electron
  // 版本或 ABI 组合下出现兼容性问题（报 napi_create_external_arraybuffer failed）
  NAPI_CALL(env, napi_create_arraybuffer(env, usedBytes, &array_data, &arraybuffer));
  std::memcpy(array_data, buf, usedBytes);
  free(buf);

  qhy.CloseQHYCCD(handle);
  qhy.ReleaseQHYCCDResource();

  napi_value result;
  NAPI_CALL(env, napi_create_object(env, &result));

  NAPI_CALL(env, napi_set_named_property(env, result, "data", arraybuffer));

  napi_value v;
  NAPI_CALL(env, napi_create_uint32(env, w, &v));
  NAPI_CALL(env, napi_set_named_property(env, result, "width", v));

  NAPI_CALL(env, napi_create_uint32(env, h, &v));
  NAPI_CALL(env, napi_set_named_property(env, result, "height", v));

  NAPI_CALL(env, napi_create_uint32(env, bpp, &v));
  NAPI_CALL(env, napi_set_named_property(env, result, "bpp", v));

  NAPI_CALL(env, napi_create_uint32(env, channels, &v));
  NAPI_CALL(env, napi_set_named_property(env, result, "channels", v));

  return result;

fail:
  if (handle) {
    qhy.CloseQHYCCD(handle);
  }
  qhy.ReleaseQHYCCDResource();
  napi_throw_error(env, NULL, "QHYCCD capture failed");
  return NULL;

fail_no_free:
  if (handle) {
    qhy.CloseQHYCCD(handle);
  }
  qhy.ReleaseQHYCCDResource();
  return NULL;
}

static napi_value Init(napi_env env, napi_value exports) {
  napi_value fn;
  NAPI_CALL(env,
            napi_create_function(env,
                                 "captureSingleFrame",
                                 NAPI_AUTO_LENGTH,
                                 CaptureSingleFrame,
                                 NULL,
                                 &fn));
  NAPI_CALL(env, napi_set_named_property(env, exports, "captureSingleFrame", fn));
  return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)
