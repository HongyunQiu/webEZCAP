// 包装头文件，解决 QHYCCD SDK 的 stdint 实现与 MSVC/C++ 标准库的冲突
#ifndef QHYCCD_SDK_WRAPPER_H
#define QHYCCD_SDK_WRAPPER_H

// ---- 在任何标准头文件之前，先在全局命名空间定义定宽整数类型 ----
// 这样可以保证后续 <cstdint> 中的 `using ::int8_t;` 等语句不会报
// “int8_t 不是 `global namespace` 的成员”的错误。

#ifdef _MSC_VER

typedef signed   __int8   int8_t;
typedef signed   __int16  int16_t;
typedef signed   __int32  int32_t;
typedef signed   __int64  int64_t;

typedef unsigned __int8   uint8_t;
typedef unsigned __int16  uint16_t;
typedef unsigned __int32  uint32_t;
typedef unsigned __int64  uint64_t;

typedef  int8_t   int_least8_t;
typedef  int16_t  int_least16_t;
typedef  int32_t  int_least32_t;
typedef  int64_t  int_least64_t;

typedef  uint8_t  uint_least8_t;
typedef  uint16_t uint_least16_t;
typedef  uint32_t uint_least32_t;
typedef  uint64_t uint_least64_t;

typedef  int8_t   int_fast8_t;
typedef  int32_t  int_fast16_t;
typedef  int32_t  int_fast32_t;
typedef  int64_t  int_fast64_t;

typedef  uint8_t  uint_fast8_t;
typedef  uint32_t uint_fast16_t;
typedef  uint32_t uint_fast32_t;
typedef  uint64_t uint_fast64_t;

#ifdef _WIN64
typedef  __int64          intptr_t;
typedef  unsigned __int64 uintptr_t;
#else
typedef  int              intptr_t;
typedef  unsigned int     uintptr_t;
#endif

typedef  int64_t  intmax_t;
typedef  uint64_t uintmax_t;

#endif // _MSC_VER

// 在 C++ 模式下，bool 类型已经可用；
// 若 SDK 在纯 C 环境下被使用，则需要手动提供 bool 定义。
#ifndef __cplusplus
typedef unsigned char bool;
#define true 1
#define false 0
#endif

// SDK 头文件为 C 接口，C++ 下需要 extern "C" 包裹
extern "C" {
#include "../sdk/include/qhyccd.h"
}

#endif // QHYCCD_SDK_WRAPPER_H

