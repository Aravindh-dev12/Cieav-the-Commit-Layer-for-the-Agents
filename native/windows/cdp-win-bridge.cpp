#define WIN32_LEAN_AND_MEAN
#include <windows.h>

#include <algorithm>
#include <cstdint>
#include <cstdio>
#include <cwchar>
#include <string>
#include <vector>

namespace {

struct Handle {
  HANDLE value = nullptr;
  Handle() = default;
  explicit Handle(HANDLE h) : value(h) {}
  Handle(const Handle&) = delete;
  Handle& operator=(const Handle&) = delete;
  Handle(Handle&& other) noexcept : value(other.value) { other.value = nullptr; }
  Handle& operator=(Handle&& other) noexcept {
    if (this != &other) { reset(); value = other.value; other.value = nullptr; }
    return *this;
  }
  ~Handle() { reset(); }
  void reset(HANDLE h = nullptr) {
    if (value && value != INVALID_HANDLE_VALUE) CloseHandle(value);
    value = h;
  }
  explicit operator bool() const { return value && value != INVALID_HANDLE_VALUE; }
};

[[noreturn]] void fail(const wchar_t* message, DWORD code = GetLastError()) {
  fwprintf(stderr, L"CIEAV Windows CDP bridge failed: %ls (win32=%lu)\n", message, static_cast<unsigned long>(code));
  ExitProcess(2);
}

std::wstring quote_arg(const std::wstring& arg) {
  if (arg.empty()) return L"\"\"";
  if (arg.find_first_of(L" \t\n\v\"") == std::wstring::npos) return arg;
  std::wstring out = L"\"";
  size_t slashes = 0;
  for (wchar_t ch : arg) {
    if (ch == L'\\') { ++slashes; continue; }
    if (ch == L'\"') {
      out.append(slashes * 2 + 1, L'\\');
      out.push_back(L'\"');
      slashes = 0;
      continue;
    }
    out.append(slashes, L'\\');
    slashes = 0;
    out.push_back(ch);
  }
  out.append(slashes * 2, L'\\');
  out.push_back(L'\"');
  return out;
}

std::wstring handle_switch(HANDLE input, HANDLE output) {
  // Chromium serializes Windows HANDLE values as unsigned 32-bit integers.
  // HANDLE is pointer-sized on Win64, but real kernel handle values are 32-bit.
  const auto in_value =
      static_cast<uint32_t>(reinterpret_cast<uintptr_t>(input));
  const auto out_value =
      static_cast<uint32_t>(reinterpret_cast<uintptr_t>(output));
  return L"--remote-debugging-io-pipes=" +
         std::to_wstring(in_value) + L"," +
         std::to_wstring(out_value);
}

struct PipeCopyContext { HANDLE input; HANDLE output; };

DWORD WINAPI copy_stream(void* raw) {
  const auto* ctx = static_cast<PipeCopyContext*>(raw);
  char buffer[64 * 1024];
  for (;;) {
    DWORD read = 0;
    if (!ReadFile(ctx->input, buffer, sizeof(buffer), &read, nullptr) || read == 0) break;
    DWORD offset = 0;
    while (offset < read) {
      DWORD written = 0;
      if (!WriteFile(ctx->output, buffer + offset, read - offset, &written, nullptr) || written == 0) return 1;
      offset += written;
    }
  }
  FlushFileBuffers(ctx->output);
  return 0;
}

}  // namespace

int wmain(int argc, wchar_t** argv) {
  std::wstring chrome;
  std::vector<std::wstring> chrome_args;
  bool after_separator = false;
  for (int i = 1; i < argc; ++i) {
    std::wstring arg = argv[i];
    if (!after_separator && arg == L"--chrome") {
      if (++i >= argc) fail(L"--chrome requires an executable path", ERROR_INVALID_PARAMETER);
      chrome = argv[i];
    } else if (!after_separator && arg == L"--") {
      after_separator = true;
    } else if (after_separator) {
      chrome_args.push_back(std::move(arg));
    } else {
      fail(L"invalid bridge argument", ERROR_INVALID_PARAMETER);
    }
  }
  if (chrome.empty()) fail(L"Chrome executable was not supplied", ERROR_INVALID_PARAMETER);

  SECURITY_ATTRIBUTES sa{};
  sa.nLength = sizeof(sa);
  sa.bInheritHandle = TRUE;
  Handle chrome_read, parent_write, parent_read, chrome_write;
  HANDLE a = nullptr, b = nullptr;
  if (!CreatePipe(&a, &b, &sa, 0)) fail(L"CreatePipe browser input");
  chrome_read.reset(a); parent_write.reset(b);
  if (!SetHandleInformation(parent_write.value, HANDLE_FLAG_INHERIT, 0)) fail(L"protect parent browser-input handle");
  a = b = nullptr;
  if (!CreatePipe(&a, &b, &sa, 0)) fail(L"CreatePipe browser output");
  parent_read.reset(a); chrome_write.reset(b);
  if (!SetHandleInformation(parent_read.value, HANDLE_FLAG_INHERIT, 0)) fail(L"protect parent browser-output handle");

  chrome_args.insert(chrome_args.begin(), handle_switch(chrome_read.value, chrome_write.value));
  chrome_args.insert(chrome_args.begin(), L"--remote-debugging-pipe");

  std::wstring command = quote_arg(chrome);
  for (const auto& arg : chrome_args) { command.push_back(L' '); command += quote_arg(arg); }
  std::vector<wchar_t> mutable_command(command.begin(), command.end());
  mutable_command.push_back(L'\0');

  SIZE_T attribute_bytes = 0;
  InitializeProcThreadAttributeList(nullptr, 1, 0, &attribute_bytes);
  std::vector<unsigned char> attribute_storage(attribute_bytes);
  auto* attributes = reinterpret_cast<PPROC_THREAD_ATTRIBUTE_LIST>(attribute_storage.data());
  if (!InitializeProcThreadAttributeList(attributes, 1, 0, &attribute_bytes)) fail(L"InitializeProcThreadAttributeList");
  HANDLE inherited[2] = {chrome_read.value, chrome_write.value};
  if (!UpdateProcThreadAttribute(attributes, 0, PROC_THREAD_ATTRIBUTE_HANDLE_LIST, inherited, sizeof(inherited), nullptr, nullptr)) {
    DeleteProcThreadAttributeList(attributes); fail(L"restrict inherited handle list");
  }

  STARTUPINFOEXW startup{};
  startup.StartupInfo.cb = sizeof(startup);
  startup.lpAttributeList = attributes;
  PROCESS_INFORMATION process{};
  const DWORD flags = EXTENDED_STARTUPINFO_PRESENT | CREATE_UNICODE_ENVIRONMENT | CREATE_SUSPENDED | CREATE_NO_WINDOW;
  if (!CreateProcessW(chrome.c_str(), mutable_command.data(), nullptr, nullptr, TRUE, flags, nullptr, nullptr, &startup.StartupInfo, &process)) {
    DeleteProcThreadAttributeList(attributes); fail(L"CreateProcessW Chromium");
  }
  DeleteProcThreadAttributeList(attributes);
  Handle process_handle(process.hProcess), thread_handle(process.hThread);
  chrome_read.reset(); chrome_write.reset();

  Handle job(CreateJobObjectW(nullptr, nullptr));
  if (!job) { TerminateProcess(process_handle.value, 2); fail(L"CreateJobObjectW"); }
  JOBOBJECT_EXTENDED_LIMIT_INFORMATION limits{};
  limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
  if (!SetInformationJobObject(job.value, JobObjectExtendedLimitInformation, &limits, sizeof(limits))) {
    TerminateProcess(process_handle.value, 2); fail(L"SetInformationJobObject");
  }
  if (!AssignProcessToJobObject(job.value, process_handle.value)) {
    TerminateProcess(process_handle.value, 2); fail(L"AssignProcessToJobObject");
  }
  if (ResumeThread(thread_handle.value) == static_cast<DWORD>(-1)) {
    TerminateProcess(process_handle.value, 2); fail(L"ResumeThread");
  }
  thread_handle.reset();

  HANDLE stdin_handle = GetStdHandle(STD_INPUT_HANDLE);
  HANDLE stdout_handle = GetStdHandle(STD_OUTPUT_HANDLE);
  if (!stdin_handle || stdin_handle == INVALID_HANDLE_VALUE || !stdout_handle || stdout_handle == INVALID_HANDLE_VALUE) {
    TerminateProcess(process_handle.value, 2); fail(L"bridge stdin/stdout unavailable", ERROR_INVALID_HANDLE);
  }

  PipeCopyContext inbound{stdin_handle, parent_write.value};
  Handle inbound_thread(CreateThread(nullptr, 0, copy_stream, &inbound, 0, nullptr));
  if (!inbound_thread) { TerminateProcess(process_handle.value, 2); fail(L"CreateThread inbound proxy"); }

  PipeCopyContext outbound{parent_read.value, stdout_handle};
  copy_stream(&outbound);
  parent_read.reset();
  WaitForSingleObject(process_handle.value, INFINITE);
  DWORD exit_code = 1;
  GetExitCodeProcess(process_handle.value, &exit_code);
  if (exit_code != 0) {
    fwprintf(stderr,
             L"CIEAV Windows CDP bridge: Chromium exited with code %lu\n",
             static_cast<unsigned long>(exit_code));
  }
  CancelSynchronousIo(inbound_thread.value);
  WaitForSingleObject(inbound_thread.value, 1500);
  parent_write.reset();
  return static_cast<int>(exit_code);
}
