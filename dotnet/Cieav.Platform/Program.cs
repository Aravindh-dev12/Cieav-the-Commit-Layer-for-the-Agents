using System.Collections.Concurrent;
using System.Diagnostics;
using System.IO.Pipes;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace Cieav.Platform;

internal static class Program
{
    private const string Protocol = "CIEAV_PLATFORM_IPC_V1";
    private const int MaxMessageBytes = 64 * 1024;
    private static readonly TimeSpan Freshness = TimeSpan.FromSeconds(30);
    private static readonly ConcurrentDictionary<string, DateTimeOffset> SeenNonces = new(StringComparer.Ordinal);
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web) { WriteIndented = false };

    public static async Task<int> Main(string[] args)
    {
        var command = args.Length == 0 ? "health" : args[0].Trim().ToLowerInvariant();
        try
        {
            return command switch
            {
                "health" => Print(Health()),
                "native-health" => NativeHealth(),
                "selftest" => SelfTest(),
                "serve" => await ServeAsync(args.Length > 1 ? args[1] : Environment.GetEnvironmentVariable("CIEAV_DOTNET_PIPE_NAME") ?? "cieav-platform-v1"),
                _ => Fail("usage: Cieav.Platform [health|native-health|selftest|serve [pipe-name]]")
            };
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"CIEAV .NET platform host failed: {ex.GetType().Name}: {ex.Message}");
            return 1;
        }
    }

    private static int Print(object value)
    {
        Console.WriteLine(JsonSerializer.Serialize(value, JsonOptions));
        return 0;
    }

    private static int Fail(string message)
    {
        Console.Error.WriteLine(message);
        return 2;
    }

    private static object Health() => new
    {
        version = Protocol,
        ok = true,
        runtime = RuntimeInformation.FrameworkDescription,
        os = RuntimeInformation.OSDescription,
        architecture = RuntimeInformation.ProcessArchitecture.ToString(),
        processId = Environment.ProcessId,
        nativeLibraryConfigured = NativeBridge.IsConfigured,
        authority = false,
        mayMintExecutionAuthority = false,
        executionAuthorityIssued = false
    };

    private static int NativeHealth()
    {
        using var native = NativeBridge.OpenConfigured();
        return Print(native.HealthSnapshot());
    }

    private static int SelfTest()
    {
        var secret = "cieav-dotnet-selftest-secret-000000000000";
        var request = new IpcRequest(Protocol, "selftest-request", "health", DateTimeOffset.UtcNow, "nonce-selftest", "");
        var mac = ComputeMac(secret, request with { Mac = string.Empty });
        if (!VerifyMac(secret, request with { Mac = mac })) return Fail("selftest_hmac_failed");
        if (VerifyMac(secret + "x", request with { Mac = mac })) return Fail("selftest_wrong_key_accepted");
        object? native = null;
        if (NativeBridge.IsConfigured)
        {
            using var bridge = NativeBridge.OpenConfigured();
            native = new { health = bridge.HealthSnapshot(), snapshot = JsonSerializer.Deserialize<JsonElement>(bridge.PlatformSnapshotJson()) };
        }
        Console.WriteLine(JsonSerializer.Serialize(new { ok = true, version = Protocol, native, authority = false, mayMintExecutionAuthority = false, executionAuthorityIssued = false }, JsonOptions));
        return 0;
    }

    private static async Task<int> ServeAsync(string pipeName)
    {
        ValidatePipeName(pipeName);
        var secret = Environment.GetEnvironmentVariable("CIEAV_DOTNET_IPC_SECRET")?.Trim();
        if (string.IsNullOrEmpty(secret) || Encoding.UTF8.GetByteCount(secret) < 32)
            throw new InvalidOperationException("CIEAV_DOTNET_IPC_SECRET must contain at least 32 UTF-8 bytes");

        Console.Error.WriteLine($"CIEAV .NET platform host serving authenticated local IPC pipe '{pipeName}'");
        using var shutdown = new CancellationTokenSource();
        Console.CancelKeyPress += (_, eventArgs) => { eventArgs.Cancel = true; shutdown.Cancel(); };
        AppDomain.CurrentDomain.ProcessExit += (_, _) => shutdown.Cancel();

        while (!shutdown.IsCancellationRequested)
        {
            await using var pipe = new NamedPipeServerStream(
                pipeName,
                PipeDirection.InOut,
                NamedPipeServerStream.MaxAllowedServerInstances,
                PipeTransmissionMode.Byte,
                PipeOptions.Asynchronous | PipeOptions.CurrentUserOnly);
            try
            {
                await pipe.WaitForConnectionAsync(shutdown.Token);
                await HandleClientAsync(pipe, secret, shutdown.Token);
            }
            catch (OperationCanceledException) when (shutdown.IsCancellationRequested)
            {
                break;
            }
            catch (IOException ex)
            {
                Console.Error.WriteLine($"CIEAV .NET platform IPC client error: {ex.Message}");
            }
            finally
            {
                if (pipe.IsConnected) pipe.Disconnect();
            }
        }
        return 0;
    }

    private static async Task HandleClientAsync(Stream stream, string secret, CancellationToken cancellationToken)
    {
        while (!cancellationToken.IsCancellationRequested)
        {
            var line = await ReadBoundedLineAsync(stream, MaxMessageBytes, cancellationToken);
            if (line is null) return;
            IpcResponse response;
            try
            {
                var request = JsonSerializer.Deserialize<IpcRequest>(line, JsonOptions) ?? throw new InvalidDataException("request is null");
                ValidateRequest(request, secret);
                response = ExecuteReadOnly(request);
            }
            catch (Exception ex)
            {
                response = IpcResponse.Error(ex.Message);
            }
            var bytes = Encoding.UTF8.GetBytes(JsonSerializer.Serialize(response, JsonOptions) + "\n");
            await stream.WriteAsync(bytes, cancellationToken);
            await stream.FlushAsync(cancellationToken);
        }
    }

    private static IpcResponse ExecuteReadOnly(IpcRequest request)
    {
        object result = request.Operation switch
        {
            "health" => Health(),
            "platform_snapshot" => PlatformSnapshot(),
            "native_snapshot" => NativeSnapshot(),
            _ => throw new InvalidOperationException("operation_not_allowed")
        };
        return new IpcResponse(Protocol, request.RequestId, true, result, null, DateTimeOffset.UtcNow, false, false, false);
    }

    private static object PlatformSnapshot()
    {
        using var current = Process.GetCurrentProcess();
        return new
        {
            machineName = Environment.MachineName,
            userName = Environment.UserName,
            processId = Environment.ProcessId,
            processStartTime = current.StartTime.ToUniversalTime(),
            os = RuntimeInformation.OSDescription,
            osArchitecture = RuntimeInformation.OSArchitecture.ToString(),
            processArchitecture = RuntimeInformation.ProcessArchitecture.ToString(),
            framework = RuntimeInformation.FrameworkDescription,
            processorCount = Environment.ProcessorCount,
            workingSetBytes = Environment.WorkingSet,
            authority = false,
            mayMintExecutionAuthority = false,
            executionAuthorityIssued = false
        };
    }

    private static object NativeSnapshot()
    {
        using var native = NativeBridge.OpenConfigured();
        return JsonSerializer.Deserialize<JsonElement>(native.PlatformSnapshotJson());
    }

    private static void ValidateRequest(IpcRequest request, string secret)
    {
        if (request.Version != Protocol) throw new InvalidDataException("protocol_version_mismatch");
        if (request.RequestId is null || request.RequestId.Length is < 8 or > 200) throw new InvalidDataException("invalid_request_id");
        if (request.Operation is null || request.Operation.Length is < 1 or > 80) throw new InvalidDataException("invalid_operation");
        if (request.Nonce is null || request.Nonce.Length is < 8 or > 200) throw new InvalidDataException("invalid_nonce");
        if (request.Mac is null || request.Mac.Length is < 16 or > 200) throw new InvalidDataException("invalid_mac");
        var now = DateTimeOffset.UtcNow;
        if ((now - request.Timestamp).Duration() > Freshness) throw new InvalidDataException("stale_request");
        PruneNonces(now);
        if (!SeenNonces.TryAdd(request.Nonce, now)) throw new InvalidDataException("replayed_nonce");
        if (!VerifyMac(secret, request))
        {
            SeenNonces.TryRemove(request.Nonce, out _);
            throw new CryptographicException("invalid_request_mac");
        }
    }

    private static void PruneNonces(DateTimeOffset now)
    {
        foreach (var pair in SeenNonces)
            if (now - pair.Value > Freshness + Freshness) SeenNonces.TryRemove(pair.Key, out _);
        if (SeenNonces.Count > 100_000) throw new InvalidOperationException("nonce_cache_capacity_exceeded");
    }

    private static string ComputeMac(string secret, IpcRequest request)
    {
        var canonical = string.Join('|', request.Version, request.RequestId, request.Operation, request.Timestamp.ToUniversalTime().ToString("O"), request.Nonce);
        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(secret));
        return Base64Url(hmac.ComputeHash(Encoding.UTF8.GetBytes(canonical)));
    }

    private static bool VerifyMac(string secret, IpcRequest request)
    {
        byte[] expected;
        byte[] actual;
        try
        {
            expected = Encoding.ASCII.GetBytes(ComputeMac(secret, request with { Mac = string.Empty }));
            actual = Encoding.ASCII.GetBytes(request.Mac);
        }
        catch
        {
            return false;
        }
        return expected.Length == actual.Length && CryptographicOperations.FixedTimeEquals(expected, actual);
    }

    private static string Base64Url(byte[] bytes) => Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    private static async Task<string?> ReadBoundedLineAsync(Stream stream, int maxBytes, CancellationToken cancellationToken)
    {
        using var buffer = new MemoryStream();
        var one = new byte[1];
        while (buffer.Length <= maxBytes)
        {
            var read = await stream.ReadAsync(one, cancellationToken);
            if (read == 0) return buffer.Length == 0 ? null : Encoding.UTF8.GetString(buffer.ToArray());
            if (one[0] == (byte)'\n') return Encoding.UTF8.GetString(buffer.ToArray());
            if (one[0] != (byte)'\r') buffer.WriteByte(one[0]);
        }
        throw new InvalidDataException("ipc_message_too_large");
    }

    private static void ValidatePipeName(string pipeName)
    {
        if (pipeName.Length is < 3 or > 120) throw new ArgumentException("invalid pipe name");
        foreach (var c in pipeName)
            if (!(char.IsLetterOrDigit(c) || c is '-' or '_' or '.')) throw new ArgumentException("invalid pipe name");
    }

    private sealed record IpcRequest(string Version, string RequestId, string Operation, DateTimeOffset Timestamp, string Nonce, string Mac);
    private sealed record IpcResponse(string Version, string? RequestId, bool Ok, object? Result, string? Error, DateTimeOffset RespondedAt, bool Authority, bool MayMintExecutionAuthority, bool ExecutionAuthorityIssued)
    {
        public static IpcResponse Error(string error) => new(Protocol, null, false, null, error[..Math.Min(error.Length, 500)], DateTimeOffset.UtcNow, false, false, false);
    }
}
