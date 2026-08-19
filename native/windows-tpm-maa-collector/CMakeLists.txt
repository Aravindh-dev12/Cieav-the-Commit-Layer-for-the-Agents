cmake_minimum_required(VERSION 3.20)
project(cieav_windows_tpm_maa_collector LANGUAGES CXX)

set(CIEAV_ATTEST_PACKAGE_DIR "" CACHE PATH "Path to pre-provisioned Microsoft.Attestation.Client package")
if(NOT CIEAV_ATTEST_PACKAGE_DIR)
  message(FATAL_ERROR "CIEAV_ATTEST_PACKAGE_DIR must point to a pre-provisioned Microsoft.Attestation.Client package; this target does not download dependencies")
endif()

find_package(azure-identity-cpp CONFIG REQUIRED)
find_package(azure-security-attestation-cpp CONFIG REQUIRED)

add_executable(cieav-windows-tpm-maa-collector main.cpp)
target_compile_features(cieav-windows-tpm-maa-collector PRIVATE cxx_std_20)
target_compile_definitions(cieav-windows-tpm-maa-collector PRIVATE UNICODE _UNICODE WIN32_LEAN_AND_MEAN NOMINMAX)
target_include_directories(cieav-windows-tpm-maa-collector PRIVATE "${CIEAV_ATTEST_PACKAGE_DIR}/inc")
target_link_libraries(cieav-windows-tpm-maa-collector PRIVATE
  ncrypt
  "${CIEAV_ATTEST_PACKAGE_DIR}/lib/azure-attest-manager.lib"
  Azure::azure-identity
  Azure::azure-security-attestation)

if(MSVC)
  target_compile_options(cieav-windows-tpm-maa-collector PRIVATE /W4 /WX /permissive- /guard:cf /sdl)
  target_link_options(cieav-windows-tpm-maa-collector PRIVATE /DYNAMICBASE /NXCOMPAT)
endif()

install(TARGETS cieav-windows-tpm-maa-collector RUNTIME DESTINATION .)
install(FILES
  "${CIEAV_ATTEST_PACKAGE_DIR}/bin/azure-attest-manager.dll"
  "${CIEAV_ATTEST_PACKAGE_DIR}/bin/AzureAttestManager.dll"
  "${CIEAV_ATTEST_PACKAGE_DIR}/bin/AzureAttestNormal.dll"
  DESTINATION .)
