using System.Diagnostics;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Windows.Automation;

const int MaxInputChars = 64_000;

static async Task<string> ReadBoundedStdinAsync()
{
    var buffer = new char[4096];
    var sb = new StringBuilder();
    while (true)
    {
        var read = await Console.In.ReadAsync(buffer.AsMemory(0, buffer.Length));
        if (read == 0) break;
        if (sb.Length + read > MaxInputChars) throw new InvalidDataException("desktop invoke input too large");
        sb.Append(buffer, 0, read);
    }
    return sb.ToString();
}

static string Sha256Hex(string value) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value))).ToLowerInvariant();
static bool IsLowerHex64(string value) => value.Length == 64 && value.All(c => c is >= '0' and <= '9' or >= 'a' and <= 'f');
static string Clean(string? value) => (value ?? "").Replace("\r", " ").Replace("\n", " ").Replace("\0", " ").Trim();
static bool SamePath(string left, string right) { try { return string.Equals(Path.GetFullPath(left), Path.GetFullPath(right), StringComparison.OrdinalIgnoreCase); } catch { return false; } }

static IEnumerable<AutomationElement> Elements(AutomationElementCollection collection)
{
    for (var i = 0; i < collection.Count; i++) yield return collection[i];
}

static AutomationElement RequireSingle(IEnumerable<AutomationElement> values, string code)
{
    using var e = values.GetEnumerator();
    if (!e.MoveNext()) throw new InvalidDataException($"{code}_missing");
    var first = e.Current;
    if (e.MoveNext()) throw new InvalidDataException($"{code}_ambiguous");
    return first;
}

static string ProcessImage(int pid)
{
    using var process = Process.GetProcessById(pid);
    var file = process.MainModule?.FileName;
    if (string.IsNullOrWhiteSpace(file)) throw new InvalidDataException("process_image_unavailable");
    return Path.GetFullPath(file);
}

static (AutomationElement Window, AutomationElement Control) Resolve(InvokeRequest request)
{
    var root = AutomationElement.RootElement ?? throw new InvalidDataException("automation_root_unavailable");
    var windows = root.FindAll(TreeScope.Children, Condition.TrueCondition);
    var matchingWindows = Elements(windows).Where(window =>
    {
        try
        {
            var pid = window.Current.ProcessId;
            return pid > 0 && SamePath(ProcessImage(pid), request.AppId) && string.Equals(window.Current.AutomationId, request.WindowId, StringComparison.Ordinal);
        }
        catch { return false; }
    }).ToArray();
    var targetWindow = RequireSingle(matchingWindows, "window");
    var controls = targetWindow.FindAll(TreeScope.Descendants, new PropertyCondition(AutomationElement.AutomationIdProperty, request.ControlId));
    var targetControl = RequireSingle(Elements(controls), "control");
    if (targetControl.Current.ProcessId != targetWindow.Current.ProcessId) throw new InvalidDataException("control_process_mismatch");
    return (targetWindow, targetControl);
}

static string StateDigest(AutomationElement window, AutomationElement control)
{
    var material = string.Join("\n", new[]
    {
        "CIEAV_DESKTOP_UI_STATE_V1",
        ProcessImage(window.Current.ProcessId).ToUpperInvariant(),
        Clean(window.Current.AutomationId),
        Clean(window.Current.Name),
        Clean(control.Current.AutomationId),
        Clean(control.Current.Name),
        Clean(control.Current.ControlType?.ProgrammaticName),
        control.Current.IsEnabled ? "enabled=1" : "enabled=0",
        control.Current.IsOffscreen ? "offscreen=1" : "offscreen=0",
        control.Current.IsKeyboardFocusable ? "focusable=1" : "focusable=0"
    });
    return Sha256Hex(material);
}

static void Emit(bool effectStarted, string transport, string detailCode, string? postStateDigest = null)
{
    Console.Out.WriteLine(JsonSerializer.Serialize(new ExecutionResponse
    {
        Version = 1,
        Kind = "EXECUTION_RESULT",
        EffectStarted = effectStarted,
        Transport = transport,
        DetailCode = detailCode,
        PostStateDigest = postStateDigest
    }, JsonOptions.Default));
}

try
{
    var request = JsonSerializer.Deserialize<InvokeRequest>(await ReadBoundedStdinAsync(), JsonOptions.Default) ?? throw new InvalidDataException("missing request");
    request.Validate();

    AutomationElement window;
    AutomationElement control;
    try { (window, control) = Resolve(request); }
    catch { Emit(false, "REJECTED", "TARGET_NOT_EXACT"); return 0; }

    string before;
    try { before = StateDigest(window, control); }
    catch { Emit(false, "REJECTED", "PRESTATE_UNREADABLE"); return 0; }
    if (!string.Equals(before, request.ExpectedStateDigest, StringComparison.Ordinal)) { Emit(false, "REJECTED", "PRESTATE_MISMATCH"); return 0; }
    if (!control.Current.IsEnabled || control.Current.IsOffscreen) { Emit(false, "REJECTED", "CONTROL_NOT_INVOKABLE_STATE"); return 0; }
    if (!control.TryGetCurrentPattern(InvokePattern.Pattern, out var patternObject) || patternObject is not InvokePattern invokePattern) { Emit(false, "REJECTED", "INVOKE_PATTERN_UNAVAILABLE"); return 0; }

    try { invokePattern.Invoke(); }
    catch { Emit(true, "UNKNOWN", "INVOKE_CALL_FAILED"); return 0; }

    string? post = null;
    try { var resolved = Resolve(request); post = StateDigest(resolved.Window, resolved.Control); } catch { }
    Emit(true, "ACCEPTED", "INVOKE_DISPATCHED", post);
    return 0;
}
catch { return 2; }

sealed class InvokeRequest
{
    public int Version { get; set; }
    public string Kind { get; set; } = "";
    public string TicketId { get; set; } = "";
    public string ProposalId { get; set; } = "";
    public string NormalizedArgumentsDigest { get; set; } = "";
    public string Platform { get; set; } = "";
    public string AppId { get; set; } = "";
    public string WindowId { get; set; } = "";
    public string ControlId { get; set; } = "";
    public string Action { get; set; } = "";
    public string ExpectedStateDigest { get; set; } = "";
    public void Validate()
    {
        if (Version != 1 || Kind != "INVOKE" || Platform != "win32" || Action != "INVOKE") throw new InvalidDataException("invalid envelope");
        if (!Guid.TryParse(TicketId, out _) || !Guid.TryParse(ProposalId, out _)) throw new InvalidDataException("invalid authority ids");
        if (!IsLowerHex64(NormalizedArgumentsDigest) || !IsLowerHex64(ExpectedStateDigest)) throw new InvalidDataException("invalid digest");
        if (!Path.IsPathFullyQualified(AppId)) throw new InvalidDataException("appId must be an absolute process image path");
        if (string.IsNullOrWhiteSpace(WindowId) || string.IsNullOrWhiteSpace(ControlId)) throw new InvalidDataException("missing automation ids");
        if (new[] { AppId, WindowId, ControlId }.Any(v => v.Length > 512 || v.IndexOfAny(new[] { '\r', '\n', '\0' }) >= 0)) throw new InvalidDataException("invalid identity");
    }
}

sealed class ExecutionResponse
{
    public int Version { get; set; }
    public string Kind { get; set; } = "";
    public bool EffectStarted { get; set; }
    public string Transport { get; set; } = "";
    public string DetailCode { get; set; } = "";
    public string? PostStateDigest { get; set; }
}

static class JsonOptions
{
    public static readonly JsonSerializerOptions Default = new(JsonSerializerDefaults.Web)
    {
        PropertyNameCaseInsensitive = false,
        WriteIndented = false,
        UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow
    };
}
