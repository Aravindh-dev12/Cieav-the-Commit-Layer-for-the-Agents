#include "cieav_native_ml.h"

#include <algorithm>
#include <cstdint>
#include <cstring>
#include <limits>
#include <memory>
#include <new>
#include <string>
#include <vector>

#if defined(CIEAV_WITH_ONNXRUNTIME)
#include <onnxruntime_cxx_api.h>

namespace {
struct CieavOnnxSession {
    Ort::Env env;
    Ort::SessionOptions options;
    Ort::Session session;

    explicit CieavOnnxSession(const char *model_path)
        : env(ORT_LOGGING_LEVEL_WARNING, "cieav-native"),
          options(),
#if defined(_WIN32)
          session(env, std::wstring(model_path, model_path + std::strlen(model_path)).c_str(), options)
#else
          session(env, model_path, options)
#endif
    {
        options.SetGraphOptimizationLevel(GraphOptimizationLevel::ORT_ENABLE_ALL);
    }
};

bool valid_shape(const int64_t *shape, size_t rank, size_t *elements) {
    if (shape == nullptr || elements == nullptr || rank == 0u || rank > 16u) return false;
    size_t product = 1u;
    for (size_t i = 0u; i < rank; ++i) {
        if (shape[i] <= 0) return false;
        const auto dim = static_cast<size_t>(shape[i]);
        if (product > std::numeric_limits<size_t>::max() / dim) return false;
        product *= dim;
    }
    *elements = product;
    return true;
}
} // namespace
#endif

extern "C" {

int32_t cieav_native_onnx_available(void) {
#if defined(CIEAV_WITH_ONNXRUNTIME)
    return 1;
#else
    return 0;
#endif
}

int32_t cieav_native_onnx_open(const char *model_path_utf8, cieav_onnx_session_handle *session_out) {
    if (model_path_utf8 == nullptr || model_path_utf8[0] == '\0' || session_out == nullptr) return CIEAV_NATIVE_E_INVALID_ARGUMENT;
    *session_out = nullptr;
#if defined(CIEAV_WITH_ONNXRUNTIME)
    try {
        auto *session = new CieavOnnxSession(model_path_utf8);
        *session_out = reinterpret_cast<cieav_onnx_session_handle>(session);
        return CIEAV_NATIVE_OK;
    } catch (const Ort::Exception &) {
        return CIEAV_NATIVE_E_INTERNAL;
    } catch (const std::bad_alloc &) {
        return CIEAV_NATIVE_E_INTERNAL;
    }
#else
    (void)model_path_utf8;
    return CIEAV_NATIVE_E_UNSUPPORTED;
#endif
}

int32_t cieav_native_onnx_run_f32(
    cieav_onnx_session_handle session_handle,
    const char *input_name_utf8,
    const float *input_data,
    const int64_t *input_shape,
    size_t input_rank,
    const char *output_name_utf8,
    float *output_data,
    size_t output_capacity,
    size_t *output_required) {
    if (session_handle == nullptr || input_name_utf8 == nullptr || input_data == nullptr || output_name_utf8 == nullptr || output_required == nullptr) return CIEAV_NATIVE_E_INVALID_ARGUMENT;
#if defined(CIEAV_WITH_ONNXRUNTIME)
    size_t input_elements = 0u;
    if (!valid_shape(input_shape, input_rank, &input_elements)) return CIEAV_NATIVE_E_INVALID_ARGUMENT;
    try {
        auto *session = reinterpret_cast<CieavOnnxSession *>(session_handle);
        auto memory = Ort::MemoryInfo::CreateCpu(OrtArenaAllocator, OrtMemTypeDefault);
        auto input = Ort::Value::CreateTensor<float>(memory, const_cast<float *>(input_data), input_elements, input_shape, input_rank);
        const char *input_names[] = {input_name_utf8};
        const char *output_names[] = {output_name_utf8};
        auto outputs = session->session.Run(Ort::RunOptions{nullptr}, input_names, &input, 1u, output_names, 1u);
        if (outputs.size() != 1u || !outputs[0].IsTensor()) return CIEAV_NATIVE_E_INTERNAL;
        const auto info = outputs[0].GetTensorTypeAndShapeInfo();
        if (info.GetElementType() != ONNX_TENSOR_ELEMENT_DATA_TYPE_FLOAT) return CIEAV_NATIVE_E_UNSUPPORTED;
        const size_t required = info.GetElementCount();
        *output_required = required;
        if (output_data == nullptr || output_capacity < required) return CIEAV_NATIVE_E_BUFFER_TOO_SMALL;
        const float *source = outputs[0].GetTensorData<float>();
        std::copy_n(source, required, output_data);
        return CIEAV_NATIVE_OK;
    } catch (const Ort::Exception &) {
        return CIEAV_NATIVE_E_INTERNAL;
    }
#else
    (void)input_shape;
    (void)input_rank;
    (void)output_data;
    (void)output_capacity;
    return CIEAV_NATIVE_E_UNSUPPORTED;
#endif
}

void cieav_native_onnx_close(cieav_onnx_session_handle session_handle) {
#if defined(CIEAV_WITH_ONNXRUNTIME)
    delete reinterpret_cast<CieavOnnxSession *>(session_handle);
#else
    (void)session_handle;
#endif
}

} // extern "C"
