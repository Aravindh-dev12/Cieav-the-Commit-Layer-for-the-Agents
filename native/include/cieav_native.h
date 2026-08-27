#ifndef CIEAV_NATIVE_H
#define CIEAV_NATIVE_H

#include <stddef.h>
#include <stdint.h>

#if defined(_WIN32)
  #if defined(CIEAV_NATIVE_BUILD_SHARED)
    #define CIEAV_NATIVE_API __declspec(dllexport)
  #elif defined(CIEAV_NATIVE_USE_SHARED)
    #define CIEAV_NATIVE_API __declspec(dllimport)
  #else
    #define CIEAV_NATIVE_API
  #endif
#else
  #if defined(__GNUC__) || defined(__clang__)
    #define CIEAV_NATIVE_API __attribute__((visibility("default")))
  #else
    #define CIEAV_NATIVE_API
  #endif
#endif

#ifdef __cplusplus
extern "C" {
#endif

#define CIEAV_NATIVE_ABI_VERSION 1u
#define CIEAV_NATIVE_STATUS_V1_VERSION 1u

#define CIEAV_NATIVE_OK 0
#define CIEAV_NATIVE_E_INVALID_ARGUMENT 1
#define CIEAV_NATIVE_E_BUFFER_TOO_SMALL 2
#define CIEAV_NATIVE_E_UNSUPPORTED 3
#define CIEAV_NATIVE_E_INTERNAL 4

typedef struct cieav_native_status_v1 {
    uint32_t struct_size;
    uint32_t struct_version;
    int32_t code;
    uint8_t authority;
    uint8_t may_mint_execution_authority;
    uint8_t execution_authority_issued;
    uint8_t reserved0;
    uint64_t process_id;
} cieav_native_status_v1;

/** Returns the ABI version supported by the loaded native library. */
CIEAV_NATIVE_API uint32_t cieav_native_abi_version(void);

/**
 * Read-only health probe. The status object always returns zero authority.
 * Caller must set struct_size=sizeof(cieav_native_status_v1) and
 * struct_version=CIEAV_NATIVE_STATUS_V1_VERSION before calling.
 */
CIEAV_NATIVE_API int32_t cieav_native_health(cieav_native_status_v1 *status);

/**
 * Writes a bounded UTF-8 JSON platform snapshot. No secrets, credentials,
 * execution tickets, or mutable authority state are exposed.
 *
 * If out is NULL or capacity is too small, returns BUFFER_TOO_SMALL and writes
 * the required byte count (including NUL) to required_size when non-NULL.
 */
CIEAV_NATIVE_API int32_t cieav_native_platform_snapshot(
    char *out,
    size_t capacity,
    size_t *required_size);

/** Best-effort compiler-resistant zeroing of caller-owned memory. */
CIEAV_NATIVE_API void cieav_native_secure_zero(void *ptr, size_t size);

#ifdef __cplusplus
}
#endif

#endif /* CIEAV_NATIVE_H */
