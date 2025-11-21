#include "qhyccd_dynamic.h"

#include <cstring>

static bool LoadFunctionPointers(QHYCCDFunctions *fns) {
  auto load = [dll = fns->dll](auto &fn, const char *name) -> bool {
    FARPROC p = GetProcAddress(dll, name);
    if (!p) {
      return false;
    }
    fn = reinterpret_cast<decltype(fn)>(p);
    return true;
  };

  return
    load(fns->InitQHYCCDResource,   "InitQHYCCDResource")   &&
    load(fns->ReleaseQHYCCDResource,"ReleaseQHYCCDResource")&&
    load(fns->ScanQHYCCD,           "ScanQHYCCD")           &&
    load(fns->GetQHYCCDId,          "GetQHYCCDId")          &&
    load(fns->OpenQHYCCD,           "OpenQHYCCD")           &&
    load(fns->CloseQHYCCD,          "CloseQHYCCD")          &&
    load(fns->SetQHYCCDStreamMode,  "SetQHYCCDStreamMode")  &&
    load(fns->InitQHYCCD,           "InitQHYCCD")           &&
    load(fns->SetQHYCCDBinMode,     "SetQHYCCDBinMode")     &&
    load(fns->SetQHYCCDResolution,  "SetQHYCCDResolution")  &&
    load(fns->SetQHYCCDParam,       "SetQHYCCDParam")       &&
    load(fns->ExpQHYCCDSingleFrame, "ExpQHYCCDSingleFrame") &&
    load(fns->GetQHYCCDMemLength,   "GetQHYCCDMemLength")   &&
    load(fns->GetQHYCCDSingleFrame, "GetQHYCCDSingleFrame");
}

bool LoadQHYCCDLibrary(QHYCCDFunctions *fns, const wchar_t *dllPath) {
  if (!fns) {
    return false;
  }
  std::memset(fns, 0, sizeof(*fns));

  HMODULE dll = LoadLibraryW(dllPath ? dllPath : L"qhyccd.dll");
  if (!dll) {
    return false;
  }

  fns->dll = dll;
  if (!LoadFunctionPointers(fns)) {
    FreeLibrary(dll);
    std::memset(fns, 0, sizeof(*fns));
    return false;
  }

  return true;
}

void UnloadQHYCCDLibrary(QHYCCDFunctions *fns) {
  if (!fns) {
    return;
  }
  if (fns->dll) {
    FreeLibrary(fns->dll);
    fns->dll = nullptr;
  }
  std::memset(fns, 0, sizeof(*fns));
}


