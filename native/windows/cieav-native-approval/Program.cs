using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Microsoft.Windows.AppNotifications;
using Microsoft.Windows.AppNotifications.Builder;

const int MaxInputChars = 64_000;

static async Task<string> ReadBoundedStdinAsync()
{
    var buffer = new char[4096];
    var sb = new StringBuilder();
    while (true)
    {
        var read = await Console.In.ReadAsync(buffer.AsMemory(0, buffer.Length));
        if (read == 0) break;
        if (sb.Length + read > MaxInputChars) throw new InvalidDataException("native approval input too large");
        sb.Append(buffer, 0, read);
    }
    return sb.ToString();
}

static Dictionary<string,string> ParseArguments(string raw)
{
    var result = new Dictionary<string,string>(StringComparer.Ordinal);
    foreach (var item in raw.Split('&', StringSplitOptions.RemoveEmptyEntries))
    {
        var parts = item.Split('=', 2);
        var key = Uri.UnescapeDataString(parts[0]);
        var value = parts.Length == 2 ? Uri.UnescapeDataString(parts[1]) : "";
        if (!string.IsNullOrWhiteSpace(key)) result[key] = value;
    }
    return result;
}

static bool IsSafeCallback(Uri uri) =>
    uri.Scheme == Uri.UriSchemeHttp &&
    uri.Host == "127.0.0.1" &&
    uri.AbsolutePath == "/api/native-approval" &&
    string.IsNullOrEmpty(uri.UserInfo) &&
    string.IsNullOrEmpty(uri.Query) &&
    string.IsNullOrEmpty(uri.Fragment) &&
    uri.Port is >= 1024 and <= 65535;

static string Clean(string? value, int max)
{
    var text = string.Join(' ', (value ?? "").Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries));
    return text.Length <= max ? text : text[..max];
}

ApprovalUiRequest request;
try
{
    var raw = await ReadBoundedStdinAsync();
    request = JsonSerializer.Deserialize<ApprovalUiRequest>(raw, JsonOptions.Default)
        ?? throw new InvalidDataException("missing native approval request");
    request.Validate();
}
catch
{
    return 2;
}

var callback = new Uri(request.CallbackUrl, UriKind.Absolute);
if (!IsSafeCallback(callback)) return 3;
var expiresAt = DateTimeOffset.Parse(request.ExpiresAt, null, System.Globalization.DateTimeStyles.RoundtripKind);
if (expiresAt <= DateTimeOffset.UtcNow) return 4;
if (request.Approve.Payload.ChallengeId != request.Deny.Payload.ChallengeId ||
    request.Approve.Payload.DeviceId != request.Deny.Payload.DeviceId ||
    request.Approve.Payload.ProposalDigest != request.Deny.Payload.ProposalDigest ||
    request.Approve.Payload.Decision != "APPROVED" || request.Deny.Payload.Decision != "DENIED") return 5;

var challengeId = request.Approve.Payload.ChallengeId;
var activation = new TaskCompletionSource<string>(TaskCreationOptions.RunContinuationsAsynchronously);
var manager = AppNotificationManager.Default;
manager.NotificationInvoked += (_, args) =>
{
    try
    {
        var values = ParseArguments(args.Argument ?? "");
        if (!values.TryGetValue("challenge", out var challenge) || challenge != challengeId) return;
        if (!values.TryGetValue("decision", out var decision) || (decision != "approve" && decision != "deny")) return;
        activation.TrySetResult(decision);
    }
    catch { }
};

try
{
    manager.Register();
    var notification = new AppNotificationBuilder()
        .AddText(Clean(request.Title, 80))
        .AddText(Clean(request.Message, 220))
        .AddText($"Risk: {Clean(request.Risk, 16)} · expires {expiresAt.ToLocalTime():T}")
        .AddButton(new AppNotificationButton("Allow once").AddArgument("decision", "approve").AddArgument("challenge", challengeId))
        .AddButton(new AppNotificationButton("Block").AddArgument("decision", "deny").AddArgument("challenge", challengeId))
        .BuildNotification();
    notification.Expiration = expiresAt;
    notification.ExpiresOnReboot = true;
    notification.Tag = challengeId.Replace("-", "")[..16];
    manager.Show(notification);

    var remaining = expiresAt - DateTimeOffset.UtcNow;
    if (remaining <= TimeSpan.Zero) return 4;
    var completed = await Task.WhenAny(activation.Task, Task.Delay(remaining));
    if (completed != activation.Task) return 0; // dismissal/no interaction remains blocked until challenge expiry

    var decision = await activation.Task;
    object capability = decision == "approve" ? request.Approve : request.Deny;
    using var handler = new HttpClientHandler { AllowAutoRedirect = false, UseProxy = false, AutomaticDecompression = DecompressionMethods.None };
    using var client = new HttpClient(handler) { Timeout = TimeSpan.FromSeconds(3) };
    using var response = await client.PostAsJsonAsync(callback, new { capability }, JsonOptions.Default);
    if (!response.IsSuccessStatusCode) return 6;
    try { await manager.RemoveByTagAsync(notification.Tag); } catch { }
    return 0;
}
catch
{
    return 7;
}
finally
{
    try { manager.Unregister(); } catch { }
}

sealed class ApprovalUiRequest
{
    public string Version { get; set; } = "";
    public string Title { get; set; } = "";
    public string Message { get; set; } = "";
    public string Risk { get; set; } = "";
    public string ExpiresAt { get; set; } = "";
    public string CallbackUrl { get; set; } = "";
    public ApprovalCapability Approve { get; set; } = new();
    public ApprovalCapability Deny { get; set; } = new();
    public void Validate()
    {
        if (Version != "CIEAV_NATIVE_APPROVAL_UI_V1") throw new InvalidDataException("invalid version");
        if (string.IsNullOrWhiteSpace(Title) || string.IsNullOrWhiteSpace(Message)) throw new InvalidDataException("missing display content");
        Approve.Validate(); Deny.Validate();
    }
}

sealed class ApprovalCapability
{
    public ApprovalPayload Payload { get; set; } = new();
    public string Mac { get; set; } = "";
    public void Validate()
    {
        Payload.Validate();
        if (Mac.Length != 43 || Mac.Any(c => !(char.IsLetterOrDigit(c) || c is '_' or '-'))) throw new InvalidDataException("invalid mac");
    }
}

sealed class ApprovalPayload
{
    public string Version { get; set; } = "";
    public string ChallengeId { get; set; } = "";
    public string DeviceId { get; set; } = "";
    public string RequestId { get; set; } = "";
    public string ProposalId { get; set; } = "";
    public string ProposalDigest { get; set; } = "";
    public string PrincipalId { get; set; } = "";
    public string Resource { get; set; } = "";
    public string Risk { get; set; } = "";
    public string Decision { get; set; } = "";
    public string ExpiresAt { get; set; } = "";
    public string Nonce { get; set; } = "";
    public bool Authority { get; set; }
    public bool ExecutionAuthorityIssued { get; set; }
    public void Validate()
    {
        if (Version != "CIEAV_NATIVE_APPROVAL_ACTIVATION_V1" || Authority || ExecutionAuthorityIssued) throw new InvalidDataException("authority invariant");
        if (!Guid.TryParse(ChallengeId, out _) || !Guid.TryParse(ProposalId, out _)) throw new InvalidDataException("invalid ids");
        if (RequestId.Length is < 8 or > 128 || DeviceId.Length is < 8 or > 200 || PrincipalId.Length is < 1 or > 240 || Resource.Length is < 1 or > 500) throw new InvalidDataException("invalid binding");
        if (ProposalDigest.Length != 64 || Nonce.Length != 64 || !ProposalDigest.All(Uri.IsHexDigit) || !Nonce.All(Uri.IsHexDigit)) throw new InvalidDataException("invalid digest");
        if (Decision is not ("APPROVED" or "DENIED")) throw new InvalidDataException("invalid decision");
        _ = DateTimeOffset.Parse(ExpiresAt, null, System.Globalization.DateTimeStyles.RoundtripKind);
    }
}

static class JsonOptions
{
    public static readonly JsonSerializerOptions Default = new(JsonSerializerDefaults.Web)
    {
        PropertyNameCaseInsensitive = true,
        WriteIndented = false
    };
}
