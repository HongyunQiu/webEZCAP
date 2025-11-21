// 本地 stdint.h，覆盖 SDK 和第三方的实现，在 MSVC+C++ 环境下提供标准定宽整数类型。
// 设计目标：
// 1. 作为 <stdint.h> 被 <cstdint> 包含时，先在全局命名空间中定义 int*_t/uint*_t 等类型；
// 2. 作为 "stdint.h" 被 QHYCCD SDK 头文件包含时，同样提供这些类型；
// 这样可以避免 SDK 自带的 stdint 实现与 MSVC 标准库的冲突。

#ifndef LOCAL_STDINT_H
#define LOCAL_STDINT_H 1

/* 仅在 MSVC 下自定义实现；其它编译器则直接用系统自带的 stdint.h */
#ifdef _MSC_VER

/* MSVC 下使用 __intN 作为基础类型 */
typedef signed   __int8   int8_t;
typedef signed   __int16  int16_t;
typedef signed   __int32  int32_t;
typedef signed   __int64  int64_t;

typedef unsigned __int8   uint8_t;
typedef unsigned __int16  uint16_t;
typedef unsigned __int32  uint32_t;
typedef unsigned __int64  uint64_t;

/* 最小宽度类型 */
typedef  int8_t   int_least8_t;
typedef  int16_t  int_least16_t;
typedef  int32_t  int_least32_t;
typedef  int64_t  int_least64_t;

typedef  uint8_t  uint_least8_t;
typedef  uint16_t uint_least16_t;
typedef  uint32_t uint_least32_t;
typedef  uint64_t uint_least64_t;

/* “最快”类型（在当前平台上选一个 >= 指定位宽的高效类型） */
typedef  int8_t   int_fast8_t;
typedef  int32_t  int_fast16_t;
typedef  int32_t  int_fast32_t;
typedef  int64_t  int_fast64_t;

typedef  uint8_t  uint_fast8_t;
typedef  uint32_t uint_fast16_t;
typedef  uint32_t uint_fast32_t;
typedef  uint64_t uint_fast64_t;

/* 指针宽度相关 */
#ifdef _WIN64
typedef  __int64          intptr_t;
typedef  unsigned __int64 uintptr_t;
#else
typedef  int              intptr_t;
typedef  unsigned int     uintptr_t;
#endif

/* 最大宽度整数 */
typedef  int64_t  intmax_t;
typedef  uint64_t uintmax_t;

/* 为了兼容性，此处不强制定义所有 LIMIT 宏，QHYCCD SDK 只依赖类型本身。 */

#else  /* 非 MSVC：直接退回系统自带的实现 */
#include <stdint.h>
#endif /* _MSC_VER */

#endif /* LOCAL_STDINT_H */


