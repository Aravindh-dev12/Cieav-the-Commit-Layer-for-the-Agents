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
        if (sb.Length + read > MaxInputChars) throw new InvalidDataException("desktop observer input too large");
        sb.Append(buffer, 0, read);
    }
    return sb.ToString();
}

static string Sha256Hex(string value) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value))).ToLowerInvariant();

static bool SamePath(string left, string right)
{
    try { return string.Equals(Path.GetFullPath(left), Path.GetFullPath(right), StringComparison.OrdinalIgnoreCase); }
    catch { return false; }
}

static string Clean(string? value) => (value ?? "").Replace("\r", " ").Replace("\n", " ").Replace("\0", " ").Trim();

static AutomationElement RequireSingle(IEnumerable<AutomationElement> values, string code)
{
    using var e = values.GetEnumerator();
    if (!e.MoveNext()) throw new InvalidDataException($"{code}_missing");
    var first = e.Current;
    if (e.MoveNext()) throw new InvalidDataException($"{code}_ambiguous");
    return first;
}

static IEnumerable<AutomationElement> Elements(AutomationElementCollection collection)
{
    for (var i = 0; i < collection.Count; i++) yield return collection[i];
}

static string ProcessImage(int pid)
{
    using var process = Process.GetProcessById(pid);
    var file = process.MainModule?.FileName;
    if (string.IsNullOrWhiteSpace(file)) throw new InvalidDataException("process_image_unavailable");
    return Path.GetFullPath(file);
}

static (AutomationElement Window, AutomationElement Control) Resolve(ObserveRequest request)
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
    var windowImage = ProcessImage(window.Current.ProcessId);
    var material = string.Join("\n", new[]
    {
        "CIEAV_DESKTOP_UI_STATE_V1",
        windowImage.ToUpperInvariant(),
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

try
{
    var raw = await ReadBoundedStdinAsync();
    var request = JsonSerializer.Deserialize<ObserveRequest>(raw, JsonOptions.Default) ?? throw new InvalidDataException("missing request");
    request.Validate();
    var (window, control) = Resolve(request);
    var response = new ObservationResponse { Version = 1, Kind = "OBSERVATION", StateDigest = StateDigest(window, control) };
    Console.Out.WriteLine(JsonSerializer.Serialize(response, JsonOptions.Default));
    return 0;
}
catch
{
    return 2;
}

sealed class ObserveRequest
{
    public int Version { get; set; }
    public string Kind { get; set; } = "";
    public string Platform { get; set; } = "";
    public string AppId { get; set; } = "";
    public string WindowId { get; set; } = "";
    public string ControlId { get; set; } = "";
    public void Validate()
    {
        if (Version != 1 || Kind != "OBSERVE" || Platform != "win32") throw new InvalidDataException("invalid envelope");
        if (!Path.IsPathFullyQualified(AppId)) throw new InvalidDataException("appId must be an absolute process image path");
        if (string.IsNullOrWhiteSpace(WindowId) || string.IsNullOrWhiteSpace(ControlId)) throw new InvalidDataException("missing automation ids");
        if (new[] { AppId, WindowId, ControlId }.Any(v => v.Length > 512 || v.IndexOfAny(new[] { '\r', '\n', '\0' }) >= 0)) throw new InvalidDataException("invalid identity");
    }
}

sealed class ObservationResponse
{
    public int Version { get; set; }
    public string Kind { get; set; } = "";
    public string StateDigest { get; set; } = "";
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
