#include "cieav_native_ml.h"

#include <algorithm>
#include <chrono>
#include <cstring>
#include <memory>
#include <mutex>
#include <new>
#include <string>
#include <thread>

#if defined(CIEAV_WITH_ROS2)
#include <rclcpp/rclcpp.hpp>
#include <std_msgs/msg/string.hpp>

namespace {
struct CieavRos2Observer {
    std::shared_ptr<rclcpp::Node> node;
    rclcpp::Subscription<std_msgs::msg::String>::SharedPtr subscription;
    std::mutex mutex;
    std::string latest;

    CieavRos2Observer(const char *node_name, const char *topic) {
        if (!rclcpp::ok()) {
            int argc = 0;
            char **argv = nullptr;
            rclcpp::init(argc, argv);
        }
        node = rclcpp::Node::make_shared(node_name);
        subscription = node->create_subscription<std_msgs::msg::String>(
            topic,
            rclcpp::QoS(rclcpp::KeepLast(10)).best_effort(),
            [this](const std_msgs::msg::String::SharedPtr message) {
                std::lock_guard<std::mutex> lock(mutex);
                latest.assign(message->data.data(), std::min<size_t>(message->data.size(), 64u * 1024u));
            });
    }
};

bool valid_ros_name(const char *value, size_t max_len) {
    if (value == nullptr) return false;
    const size_t len = std::strlen(value);
    if (len == 0u || len > max_len) return false;
    for (size_t i = 0u; i < len; ++i) {
        const unsigned char c = static_cast<unsigned char>(value[i]);
        if (c < 0x20u || c == 0x7fu) return false;
    }
    return true;
}
} // namespace
#endif

extern "C" {

int32_t cieav_native_ros2_available(void) {
#if defined(CIEAV_WITH_ROS2)
    return 1;
#else
    return 0;
#endif
}

int32_t cieav_native_ros2_observer_open(
    const char *node_name_utf8,
    const char *topic_utf8,
    cieav_ros2_observer_handle *observer_out) {
    if (observer_out == nullptr) return CIEAV_NATIVE_E_INVALID_ARGUMENT;
    *observer_out = nullptr;
#if defined(CIEAV_WITH_ROS2)
    if (!valid_ros_name(node_name_utf8, 200u) || !valid_ros_name(topic_utf8, 1000u)) return CIEAV_NATIVE_E_INVALID_ARGUMENT;
    try {
        auto *observer = new CieavRos2Observer(node_name_utf8, topic_utf8);
        *observer_out = reinterpret_cast<cieav_ros2_observer_handle>(observer);
        return CIEAV_NATIVE_OK;
    } catch (const std::exception &) {
        return CIEAV_NATIVE_E_INTERNAL;
    }
#else
    (void)node_name_utf8;
    (void)topic_utf8;
    return CIEAV_NATIVE_E_UNSUPPORTED;
#endif
}

int32_t cieav_native_ros2_observer_read(
    cieav_ros2_observer_handle observer_handle,
    uint32_t timeout_ms,
    char *out,
    size_t capacity,
    size_t *required_size) {
    if (observer_handle == nullptr || required_size == nullptr || timeout_ms > 300000u) return CIEAV_NATIVE_E_INVALID_ARGUMENT;
#if defined(CIEAV_WITH_ROS2)
    auto *observer = reinterpret_cast<CieavRos2Observer *>(observer_handle);
    try {
        rclcpp::executors::SingleThreadedExecutor executor;
        executor.add_node(observer->node);
        const auto deadline = std::chrono::steady_clock::now() + std::chrono::milliseconds(timeout_ms);
        do {
            executor.spin_some();
            {
                std::lock_guard<std::mutex> lock(observer->mutex);
                if (!observer->latest.empty()) break;
            }
            if (timeout_ms == 0u) break;
            std::this_thread::sleep_for(std::chrono::milliseconds(5));
        } while (std::chrono::steady_clock::now() < deadline);
        executor.remove_node(observer->node);
        std::string snapshot;
        {
            std::lock_guard<std::mutex> lock(observer->mutex);
            snapshot = observer->latest;
        }
        const size_t needed = snapshot.size() + 1u;
        *required_size = needed;
        if (out == nullptr || capacity < needed) return CIEAV_NATIVE_E_BUFFER_TOO_SMALL;
        std::memcpy(out, snapshot.c_str(), needed);
        return CIEAV_NATIVE_OK;
    } catch (const std::exception &) {
        return CIEAV_NATIVE_E_INTERNAL;
    }
#else
    (void)timeout_ms;
    (void)out;
    (void)capacity;
    return CIEAV_NATIVE_E_UNSUPPORTED;
#endif
}

void cieav_native_ros2_observer_close(cieav_ros2_observer_handle observer_handle) {
#if defined(CIEAV_WITH_ROS2)
    delete reinterpret_cast<CieavRos2Observer *>(observer_handle);
#else
    (void)observer_handle;
#endif
}

} // extern "C"
