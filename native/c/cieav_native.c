#include "cieav_native.h"

#include <stdio.h>
#include <string.h>

#if defined(_WIN32)
  #define WIN32_LEAN_AND_MEAN
  #include <windows.h>
#else
  #include <unistd.h>
#endif

static uint64_t cieav_process_id(void) {
#if defined(_WIN32)
    return (uint64_t)GetCurrentProcessId();
#else
    return (uint64_t)getpid();
#endif
}

static const char *cieav_os_name(void) {
#if defined(_WIN32)
    return "windows";
#elif defined(__APPLE__)
    return "macos";
#elif defined(__linux__)
    return "linux";
#else
    return "unknown";
#endif
}

static const char *cieav_arch_name(void) {
#if defined(_M_X64) || defined(__x86_64__)
    return "x64";
#elif defined(_M_ARM64) || defined(__aarch64__)
    return "arm64";
#elif defined(_M_IX86) || defined(__i386__)
    return "x86";
#elif defined(__arm__)
    return "arm";
#else
    return "unknown";
#endif
}

uint32_t cieav_native_abi_version(void) {
    return CIEAV_NATIVE_ABI_VERSION;
}

int32_t cieav_native_health(cieav_native_status_v1 *status) {
    if (status == NULL) return CIEAV_NATIVE_E_INVALID_ARGUMENT;
    if (status->struct_size != (uint32_t)sizeof(cieav_native_status_v1) ||
        status->struct_version != CIEAV_NATIVE_STATUS_V1_VERSION) {
        return CIEAV_NATIVE_E_INVALID_ARGUMENT;
    }
    status->code = CIEAV_NATIVE_OK;
    status->authority = 0u;
    status->may_mint_execution_authority = 0u;
    status->execution_authority_issued = 0u;
    status->reserved0 = 0u;
    status->process_id = cieav_process_id();
    return CIEAV_NATIVE_OK;
}

int32_t cieav_native_platform_snapshot(char *out, size_t capacity, size_t *required_size) {
    char buffer[384];
    int written = snprintf(
        buffer,
        sizeof(buffer),
        "{\"version\":\"CIEAV_NATIVE_PLATFORM_V1\",\"abiVersion\":%u,\"os\":\"%s\",\"architecture\":\"%s\",\"processId\":%llu,\"authority\":false,\"mayMintExecutionAuthority\":false,\"executionAuthorityIssued\":false}",
        (unsigned)CIEAV_NATIVE_ABI_VERSION,
        cieav_os_name(),
        cieav_arch_name(),
        (unsigned long long)cieav_process_id());
    size_t needed;
    if (written < 0 || (size_t)written >= sizeof(buffer)) return CIEAV_NATIVE_E_INTERNAL;
    needed = (size_t)written + 1u;
    if (required_size != NULL) *required_size = needed;
    if (out == NULL || capacity < needed) return CIEAV_NATIVE_E_BUFFER_TOO_SMALL;
    memcpy(out, buffer, needed);
    return CIEAV_NATIVE_OK;
}

void cieav_native_secure_zero(void *ptr, size_t size) {
    volatile unsigned char *p = (volatile unsigned char *)ptr;
    if (p == NULL) return;
    while (size-- > 0u) *p++ = 0u;
}
