#include "cieav_native.h"

#include <array>
#include <cstdint>
#include <iostream>
#include <string>
#include <vector>

int main() {
    cieav_native_status_v1 status{};
    status.struct_size = static_cast<std::uint32_t>(sizeof(status));
    status.struct_version = CIEAV_NATIVE_STATUS_V1_VERSION;
    if (cieav_native_health(&status) != CIEAV_NATIVE_OK) return 1;
    if (status.authority || status.may_mint_execution_authority || status.execution_authority_issued) return 2;

    std::size_t required = 0;
    if (cieav_native_platform_snapshot(nullptr, 0, &required) != CIEAV_NATIVE_E_BUFFER_TOO_SMALL || required == 0) return 3;
    std::vector<char> buffer(required);
    if (cieav_native_platform_snapshot(buffer.data(), buffer.size(), nullptr) != CIEAV_NATIVE_OK) return 4;
    const std::string json(buffer.data());
    if (json.find("\"authority\":false") == std::string::npos) return 5;
    if (json.find("\"mayMintExecutionAuthority\":false") == std::string::npos) return 6;
    if (json.find("\"executionAuthorityIssued\":false") == std::string::npos) return 7;

    std::array<unsigned char, 64> sensitive{};
    sensitive.fill(0xA5);
    cieav_native_secure_zero(sensitive.data(), sensitive.size());
    for (auto value : sensitive) if (value != 0) return 8;

    std::cout << "CIEAV C++/C ABI smoke PASS\n";
    return 0;
}
