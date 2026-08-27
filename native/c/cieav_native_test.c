#include "cieav_native.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static int fail(const char *message) {
    fprintf(stderr, "CIEAV native C ABI test FAIL: %s\n", message);
    return 1;
}

int main(void) {
    cieav_native_status_v1 status;
    size_t required = 0u;
    char *snapshot;
    unsigned char secret[32];
    size_t i;

    if (cieav_native_abi_version() != CIEAV_NATIVE_ABI_VERSION) return fail("ABI version mismatch");

    memset(&status, 0xA5, sizeof(status));
    status.struct_size = (uint32_t)sizeof(status);
    status.struct_version = CIEAV_NATIVE_STATUS_V1_VERSION;
    if (cieav_native_health(&status) != CIEAV_NATIVE_OK) return fail("health failed");
    if (status.code != CIEAV_NATIVE_OK) return fail("health status code failed");
    if (status.authority != 0u || status.may_mint_execution_authority != 0u || status.execution_authority_issued != 0u) return fail("zero-authority invariant failed");
    if (status.process_id == 0u) return fail("process id missing");

    if (cieav_native_platform_snapshot(NULL, 0u, &required) != CIEAV_NATIVE_E_BUFFER_TOO_SMALL) return fail("snapshot sizing contract failed");
    if (required < 64u || required > 4096u) return fail("snapshot size outside bounds");
    snapshot = (char *)malloc(required);
    if (snapshot == NULL) return fail("allocation failed");
    if (cieav_native_platform_snapshot(snapshot, required, NULL) != CIEAV_NATIVE_OK) { free(snapshot); return fail("snapshot write failed"); }
    if (strstr(snapshot, "\"authority\":false") == NULL || strstr(snapshot, "\"executionAuthorityIssued\":false") == NULL || strstr(snapshot, "\"mayMintExecutionAuthority\":false") == NULL) { free(snapshot); return fail("snapshot authority invariant missing"); }
    free(snapshot);

    memset(secret, 0x5A, sizeof(secret));
    cieav_native_secure_zero(secret, sizeof(secret));
    for (i = 0u; i < sizeof(secret); ++i) if (secret[i] != 0u) return fail("secure zero failed");

    puts("CIEAV native C ABI test PASS");
    return 0;
}
