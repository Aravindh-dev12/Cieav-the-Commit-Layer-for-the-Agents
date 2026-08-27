using System.Runtime.InteropServices;
using System.Text;

namespace Cieav.Platform;

internal sealed class NativeBridge : IDisposable
{
    private const uint ExpectedAbiVersion = 1;
    private const uint StatusVersion = 1;
    private const int Ok = 0;
    private const int BufferTooSmall = 2;
    private readonly nint _library;
    private readonly AbiVersionDelegate _abiVersion;
    private readonly HealthDelegate _health;
    private readonly PlatformSnapshotDelegate _platformSnapshot;
    private bool _disposed;

    private NativeBridge(string libraryPath)
    {
        _library = NativeLibrary.Load(libraryPath);
        try
        {
            _abiVersion = GetDelegate<AbiVersionDelegate>("cieav_native_abi_version");
            _health = GetDelegate<HealthDelegate>("cieav_native_health");
            _platformSnapshot = GetDelegate<PlatformSnapshotDelegate>("cieav_native_platform_snapshot");
            var abi = _abiVersion();
            if (abi != ExpectedAbiVersion) throw new InvalidOperationException($"native_abi_version_mismatch:{abi}");
            ValidateHealth();
        }
        catch
        {
            NativeLibrary.Free(_library);
            throw;
        }
    }

    public static NativeBridge OpenConfigured()
    {
        var configured = Environment.GetEnvironmentVariable("CIEAV_NATIVE_LIBRARY")?.Trim();
        if (string.IsNullOrWhiteSpace(configured)) throw new InvalidOperationException("CIEAV_NATIVE_LIBRARY is not configured");
        var fullPath = Path.GetFullPath(configured);
        if (!File.Exists(fullPath)) throw new FileNotFoundException("configured CIEAV native library does not exist", fullPath);
        return new NativeBridge(fullPath);
    }

    public static bool IsConfigured => !string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("CIEAV_NATIVE_LIBRARY"));

    public object HealthSnapshot()
    {
        var status = ValidateHealth();
        return new
        {
            version = "CIEAV_NATIVE_HEALTH_V1",
            abiVersion = _abiVersion(),
            processId = status.ProcessId,
            authority = false,
            mayMintExecutionAuthority = false,
            executionAuthorityIssued = false
        };
    }

    public string PlatformSnapshotJson()
    {
        ThrowIfDisposed();
        nuint required = 0;
        var sizing = _platformSnapshot(nint.Zero, 0, ref required);
        if (sizing != BufferTooSmall || required is 0 or > 64 * 1024) throw new InvalidOperationException($"native_snapshot_invalid_size:{required}:{sizing}");
        var buffer = Marshal.AllocHGlobal(checked((int)required));
        try
        {
            var rc = _platformSnapshot(buffer, required, ref required);
            if (rc != Ok) throw new InvalidOperationException($"native_snapshot_failed:{rc}");
            var bytes = new byte[checked((int)required - 1)];
            Marshal.Copy(buffer, bytes, 0, bytes.Length);
            return Encoding.UTF8.GetString(bytes);
        }
        finally
        {
            Marshal.FreeHGlobal(buffer);
        }
    }

    private NativeStatus ValidateHealth()
    {
        ThrowIfDisposed();
        var status = new NativeStatus
        {
            StructSize = checked((uint)Marshal.SizeOf<NativeStatus>()),
            StructVersion = StatusVersion
        };
        var rc = _health(ref status);
        if (rc != Ok || status.Code != Ok) throw new InvalidOperationException($"native_health_failed:{rc}:{status.Code}");
        if (status.Authority != 0 || status.MayMintExecutionAuthority != 0 || status.ExecutionAuthorityIssued != 0) throw new InvalidOperationException("native_health_claimed_authority");
        return status;
    }

    private T GetDelegate<T>(string export) where T : Delegate
    {
        var pointer = NativeLibrary.GetExport(_library, export);
        return Marshal.GetDelegateForFunctionPointer<T>(pointer);
    }

    private void ThrowIfDisposed()
    {
        ObjectDisposedException.ThrowIf(_disposed, this);
    }

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;
        NativeLibrary.Free(_library);
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct NativeStatus
    {
        public uint StructSize;
        public uint StructVersion;
        public int Code;
        public byte Authority;
        public byte MayMintExecutionAuthority;
        public byte ExecutionAuthorityIssued;
        public byte Reserved0;
        public ulong ProcessId;
    }

    [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
    private delegate uint AbiVersionDelegate();

    [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
    private delegate int HealthDelegate(ref NativeStatus status);

    [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
    private delegate int PlatformSnapshotDelegate(nint output, nuint capacity, ref nuint requiredSize);
}
