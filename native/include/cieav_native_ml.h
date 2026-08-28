#ifndef CIEAV_NATIVE_ML_H
#define CIEAV_NATIVE_ML_H

#include "cieav_native.h"

#ifdef __cplusplus
extern "C" {
#endif

#define CIEAV_NATIVE_ML_ABI_VERSION 1u

typedef void *cieav_onnx_session_handle;
typedef void *cieav_ros2_observer_handle;

/** Returns 1 only when this library was built with the official ONNX Runtime. */
CIEAV_NATIVE_API int32_t cieav_native_onnx_available(void);

/**
 * Opens an ONNX model for inference. This is intelligence-only and carries no
 * CIEAV execution authority. The caller owns the returned session handle.
 */
CIEAV_NATIVE_API int32_t cieav_native_onnx_open(
    const char *model_path_utf8,
    cieav_onnx_session_handle *session_out);

/**
 * Executes one named float32 tensor input and returns one named float32 output.
 * Shape ranks are bounded to 16. If output_capacity is insufficient, the
 * required element count is returned through output_required.
 */
CIEAV_NATIVE_API int32_t cieav_native_onnx_run_f32(
    cieav_onnx_session_handle session,
    const char *input_name_utf8,
    const float *input_data,
    const int64_t *input_shape,
    size_t input_rank,
    const char *output_name_utf8,
    float *output_data,
    size_t output_capacity,
    size_t *output_required);

CIEAV_NATIVE_API void cieav_native_onnx_close(cieav_onnx_session_handle session);

/** Returns 1 only when built with ROS2 rclcpp observation support. */
CIEAV_NATIVE_API int32_t cieav_native_ros2_available(void);

/**
 * Starts an observation-only ROS2 node. It does not expose publishing or
 * actuator APIs. Topic data is copied into a bounded internal last-value slot.
 */
CIEAV_NATIVE_API int32_t cieav_native_ros2_observer_open(
    const char *node_name_utf8,
    const char *topic_utf8,
    cieav_ros2_observer_handle *observer_out);

/**
 * Spins the observer for up to timeout_ms and writes the latest UTF-8 message.
 * The adapter deliberately supports observation only; consequential ROS2
 * publishing must go through CIEAV Execution Fabric and an execution ticket.
 */
CIEAV_NATIVE_API int32_t cieav_native_ros2_observer_read(
    cieav_ros2_observer_handle observer,
    uint32_t timeout_ms,
    char *out,
    size_t capacity,
    size_t *required_size);

CIEAV_NATIVE_API void cieav_native_ros2_observer_close(cieav_ros2_observer_handle observer);

#ifdef __cplusplus
}
#endif

#endif /* CIEAV_NATIVE_ML_H */
