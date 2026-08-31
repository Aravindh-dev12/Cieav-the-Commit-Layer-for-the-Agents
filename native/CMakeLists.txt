cmake_minimum_required(VERSION 3.20)
project(cieav_native VERSION 1.1.0 LANGUAGES C CXX)

set(CMAKE_C_STANDARD 17)
set(CMAKE_C_STANDARD_REQUIRED ON)
set(CMAKE_C_EXTENSIONS OFF)
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

option(CIEAV_NATIVE_BUILD_SHARED "Build shared CIEAV native ABI library" ON)
option(CIEAV_NATIVE_BUILD_TESTS "Build C/C++ native ABI tests" ON)
option(CIEAV_WITH_ONNXRUNTIME "Build real ONNX Runtime inference backend" OFF)
option(CIEAV_WITH_ROS2 "Build observation-only ROS2 rclcpp backend" OFF)

set(CIEAV_NATIVE_SOURCES
  c/cieav_native.c
  cpp/onnx_backend.cpp
  cpp/ros2_observer.cpp
)

if(CIEAV_WITH_ONNXRUNTIME)
  set(ONNXRUNTIME_ROOT "$ENV{ONNXRUNTIME_ROOT}" CACHE PATH "ONNX Runtime installation root")
  find_path(ONNXRUNTIME_INCLUDE_DIR onnxruntime_cxx_api.h
    HINTS "${ONNXRUNTIME_ROOT}/include" "${ONNXRUNTIME_ROOT}/include/onnxruntime/core/session")
  find_library(ONNXRUNTIME_LIBRARY NAMES onnxruntime
    HINTS "${ONNXRUNTIME_ROOT}/lib" "${ONNXRUNTIME_ROOT}/lib64")
  if(NOT ONNXRUNTIME_INCLUDE_DIR OR NOT ONNXRUNTIME_LIBRARY)
    message(FATAL_ERROR "CIEAV_WITH_ONNXRUNTIME=ON requires official ONNX Runtime headers/library; set ONNXRUNTIME_ROOT")
  endif()
endif()

if(CIEAV_WITH_ROS2)
  find_package(rclcpp REQUIRED)
  find_package(std_msgs REQUIRED)
endif()

function(cieav_configure_native target)
  target_include_directories(${target} PUBLIC ${CMAKE_CURRENT_SOURCE_DIR}/include)
  if(CIEAV_WITH_ONNXRUNTIME)
    target_compile_definitions(${target} PRIVATE CIEAV_WITH_ONNXRUNTIME=1)
    target_include_directories(${target} PRIVATE ${ONNXRUNTIME_INCLUDE_DIR})
    target_link_libraries(${target} PRIVATE ${ONNXRUNTIME_LIBRARY})
  endif()
  if(CIEAV_WITH_ROS2)
    target_compile_definitions(${target} PRIVATE CIEAV_WITH_ROS2=1)
    target_link_libraries(${target} PRIVATE rclcpp::rclcpp ${std_msgs_TARGETS})
  endif()
  if(MSVC)
    target_compile_options(${target} PRIVATE /W4 /WX /permissive- /guard:cf /sdl)
    target_link_options(${target} PRIVATE /DYNAMICBASE /NXCOMPAT /HIGHENTROPYVA)
  elseif(WIN32)
    target_compile_options(${target} PRIVATE -Wall -Wextra -Wpedantic -Werror -fstack-protector-strong -fcf-protection=full)
    target_compile_definitions(${target} PRIVATE _FORTIFY_SOURCE=2)
    target_link_options(${target} PRIVATE -Wl,--dynamicbase,--nxcompat,--high-entropy-va)
  else()
    target_compile_options(${target} PRIVATE -Wall -Wextra -Wpedantic -Werror)
  endif()
endfunction()

add_library(cieav_native_static STATIC ${CIEAV_NATIVE_SOURCES})
cieav_configure_native(cieav_native_static)
set_target_properties(cieav_native_static PROPERTIES OUTPUT_NAME cieav_native POSITION_INDEPENDENT_CODE ON)

if(CIEAV_NATIVE_BUILD_SHARED)
  add_library(cieav_native SHARED ${CIEAV_NATIVE_SOURCES})
  cieav_configure_native(cieav_native)
  target_compile_definitions(cieav_native PRIVATE CIEAV_NATIVE_BUILD_SHARED=1)
  set_target_properties(cieav_native PROPERTIES C_VISIBILITY_PRESET hidden VISIBILITY_INLINES_HIDDEN YES)
endif()

if(CIEAV_NATIVE_BUILD_TESTS)
  enable_testing()

  add_executable(cieav_native_c_test c/cieav_native_test.c)
  target_include_directories(cieav_native_c_test PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/include)
  target_link_libraries(cieav_native_c_test PRIVATE cieav_native_static)

  add_executable(cieav_native_cpp_smoke cpp/cieav_native_smoke.cpp)
  target_include_directories(cieav_native_cpp_smoke PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/include)
  target_link_libraries(cieav_native_cpp_smoke PRIVATE cieav_native_static)

  if(MSVC)
    target_compile_options(cieav_native_c_test PRIVATE /W4 /WX /sdl)
    target_compile_options(cieav_native_cpp_smoke PRIVATE /W4 /WX /sdl)
  else()
    target_compile_options(cieav_native_c_test PRIVATE -Wall -Wextra -Wpedantic -Werror)
    target_compile_options(cieav_native_cpp_smoke PRIVATE -Wall -Wextra -Wpedantic -Werror)
  endif()

  add_test(NAME cieav_native_c_test COMMAND cieav_native_c_test)
  add_test(NAME cieav_native_cpp_smoke COMMAND cieav_native_cpp_smoke)
endif()

install(FILES include/cieav_native.h include/cieav_native_ml.h DESTINATION include)
install(TARGETS cieav_native_static ARCHIVE DESTINATION lib)
if(CIEAV_NATIVE_BUILD_SHARED)
  install(TARGETS cieav_native RUNTIME DESTINATION bin LIBRARY DESTINATION lib ARCHIVE DESTINATION lib)
endif()
