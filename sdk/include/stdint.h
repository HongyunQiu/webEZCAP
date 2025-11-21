
/* 覆盖 SDK 自带的多平台分发逻辑，在本项目中统一走标准 <stdint.h>。
 * 这样可以配合 src/stdint.h，避免与 MSVC <cstdint> 的实现冲突。
 */

#ifndef QHY_SDK_STDINT_OVERRIDE_H
#define QHY_SDK_STDINT_OVERRIDE_H 1

#include <stdint.h>

#endif /* QHY_SDK_STDINT_OVERRIDE_H */

