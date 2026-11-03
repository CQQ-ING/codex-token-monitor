using System.Collections.Concurrent;
using System.Diagnostics;
using System.Net.WebSockets;
using System.Reflection;
using System.Text;
using System.Text.Json;

namespace CodexStatusbar;

internal sealed class PageTokenStore
{
    private readonly string _sessions;
    private readonly Dictionary<string, RolloutReader> _readers = new();
    public PageTokenStore(string sessions) => _sessions = sessions;

    public object? Read(string threadId)
    {
        if (!Guid.TryParse(threadId, out _)) return null;
        if (!_readers.TryGetValue(threadId, out var reader))
        {
            var record = StateDatabase.TryReadThread(StateDatabase.ResolvePathForSessionsRoot(_sessions), threadId);
            var path = record?.RolloutPath;
            if (string.IsNullOrEmpty(path) || !File.Exists(path)) return new { threadId, total = (object?)null, turns = Array.Empty<object>() };
            reader = new RolloutReader(path);
            reader.Initialize(fullHistory: true);
            _readers[threadId] = reader;
        }
        else if (reader.TryUpdate() == RolloutUpdateResult.NeedsReinitialize)
            reader.Initialize(fullHistory: true);
        var state = reader.State;
        return new
        {
            threadId,
            total = state.HasRolloutUsage
                ? new CompletedTurnUsage(state.InputTokens, state.CachedInputTokens, state.OutputTokens) : null,
            turns = state.CompletedTurns.Values.ToArray()
        };
    }

    public static object? ReadHistory(string sessions, string threadId) => new PageTokenStore(sessions).Read(threadId);
}

// One process owns the tray and all page connections. There is no overlay window or second sampler.
internal sealed class PageTokenContext : ApplicationContext
{
    internal const int Port = 9338;
    private readonly NotifyIcon _tray;
    private readonly CancellationTokenSource _stop = new();
    private readonly string _sessions;
    private readonly ConcurrentDictionary<string, Task> _pages = new();
    private readonly HttpClient _http = new() { Timeout = TimeSpan.FromSeconds(2) };
    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };
    private static readonly string StateDirectory = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "CodexStatusbar");

    public PageTokenContext(string sessions)
    {
        _sessions = sessions;
        _tray = new NotifyIcon
        {
            Icon = SystemIcons.Application,
            Text = "Codex 页面 Token · 连接中",
            Visible = true,
            ContextMenuStrip = new ContextMenuStrip()
        };
        _tray.ContextMenuStrip.Items.Add("Codex 页面 Token（无悬浮窗口）").Enabled = false;
        _tray.ContextMenuStrip.Items.Add("退出", null, (_, _) => ExitThread());
        _ = Task.Run(RunAsync);
    }

    private static void Status(object value)
    {
        try
        {
            Directory.CreateDirectory(StateDirectory);
            File.WriteAllText(Path.Combine(StateDirectory, "page-status.json"),
                JsonSerializer.Serialize(new { time = DateTime.UtcNow, value }, JsonOptions));
        }
        catch (IOException) { }
    }

    private async Task RunAsync()
    {
        while (!_stop.IsCancellationRequested)
        {
            try
            {
                using var response = await _http.GetAsync($"http://127.0.0.1:{Port}/json/list", _stop.Token);
                using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync(_stop.Token));
                foreach (var target in document.RootElement.EnumerateArray())
                {
                    if (target.GetProperty("type").GetString() != "page") continue;
                    var url = target.GetProperty("url").GetString() ?? "";
                    if (!url.StartsWith("app://", StringComparison.Ordinal)) continue;
                    var id = target.GetProperty("id").GetString()!;
                    if (_pages.TryGetValue(id, out var prior) && !prior.IsCompleted) continue;
                    var address = target.GetProperty("webSocketDebuggerUrl").GetString()!;
                    _pages[id] = WatchPageAsync(id, address);
                }
            }
            catch (Exception error) when (error is HttpRequestException or TaskCanceledException or JsonException)
            {
                Status(new { state = "waiting-for-page-debugger", port = Port });
            }
            try { await Task.Delay(1500, _stop.Token); } catch (OperationCanceledException) { break; }
        }
    }

    private async Task WatchPageAsync(string id, string address)
    {
        using var cdp = new PageCdp();
        var store = new PageTokenStore(_sessions);
        string[] threadIds = [];
        try
        {
            await cdp.ConnectAsync(address, _stop.Token);
            cdp.Binding += data =>
            {
                try
                {
                    using var request = JsonDocument.Parse(data);
                    var value = request.RootElement;
                    var requested = value.TryGetProperty("threadId", out var element) ? element.GetString() : null;
                    threadIds = value.TryGetProperty("threadIds", out var ids) && ids.ValueKind == JsonValueKind.Array
                        ? ids.EnumerateArray().Select(e => e.GetString()).Where(s => Guid.TryParse(s, out _)).Cast<string>().Distinct().ToArray()
                        : Guid.TryParse(requested, out _) ? [requested!] : [];
                }
                catch (JsonException) { }
            };
            using var resource = Assembly.GetExecutingAssembly().GetManifestResourceStream("CodexStatusbar.PageTokens.js")!;
            using var text = new StreamReader(resource);
            var source = await text.ReadToEndAsync(_stop.Token);
            await cdp.CallAsync("Runtime.enable", new { });
            await cdp.CallAsync("Page.enable", new { });
            await cdp.CallAsync("Runtime.addBinding", new { name = "__codexTokenRequest" });
            await cdp.CallAsync("Page.addScriptToEvaluateOnNewDocument", new { source });
            await cdp.CallAsync("Runtime.evaluate", new { expression = source, returnByValue = true });
            while (!_stop.IsCancellationRequested && cdp.IsOpen)
            {
                var requestedThreads = threadIds;
                foreach (var current in requestedThreads)
                {
                    var snapshot = store.Read(current);
                    var json = JsonSerializer.Serialize(snapshot, JsonOptions);
                    var result = await cdp.CallAsync("Runtime.evaluate", new
                    {
                        expression = $"window.__codexPageTokens?.update({json})", returnByValue = true
                    });
                    Status(new { state = "page-connected", page = id, threadId = current, ui = result });
                }
                await Task.Delay(900, _stop.Token);
            }
        }
        catch (Exception error) when (error is WebSocketException or IOException or JsonException
            or OperationCanceledException or InvalidOperationException or TimeoutException)
        {
            Status(new { state = "page-reconnecting", page = id, error = error.GetType().Name });
        }
    }

    protected override void ExitThreadCore()
    {
        _stop.Cancel();
        _tray.Visible = false;
        _tray.Dispose();
        _http.Dispose();
        base.ExitThreadCore();
    }
}

internal sealed class PageCdp : IDisposable
{
    private readonly ClientWebSocket _socket = new();
    private readonly SemaphoreSlim _send = new(1);
    private readonly ConcurrentDictionary<int, TaskCompletionSource<JsonElement>> _pending = new();
    private readonly CancellationTokenSource _stop = new();
    private int _id;
    public event Action<string>? Binding;
    public bool IsOpen => _socket.State == WebSocketState.Open;

    public async Task ConnectAsync(string address, CancellationToken stop)
    {
        await _socket.ConnectAsync(new Uri(address), stop);
        _ = Task.Run(ReceiveAsync);
    }

    public async Task<JsonElement> CallAsync(string method, object parameters)
    {
        var id = Interlocked.Increment(ref _id);
        var completion = new TaskCompletionSource<JsonElement>(TaskCreationOptions.RunContinuationsAsynchronously);
        _pending[id] = completion;
        var bytes = JsonSerializer.SerializeToUtf8Bytes(new { id, method, @params = parameters });
        await _send.WaitAsync(_stop.Token);
        try { await _socket.SendAsync(bytes.AsMemory(), WebSocketMessageType.Text, true, _stop.Token); }
        finally { _send.Release(); }
        try { return await completion.Task.WaitAsync(TimeSpan.FromSeconds(8), _stop.Token); }
        finally { _pending.TryRemove(id, out _); }
    }

    private async Task ReceiveAsync()
    {
        try
        {
            var bytes = new byte[64 * 1024];
            while (IsOpen && !_stop.IsCancellationRequested)
            {
                using var message = new MemoryStream();
                ValueWebSocketReceiveResult part;
                do
                {
                    part = await _socket.ReceiveAsync(bytes.AsMemory(), _stop.Token);
                    if (part.MessageType == WebSocketMessageType.Close) return;
                    message.Write(bytes, 0, part.Count);
                } while (!part.EndOfMessage);
                using var json = JsonDocument.Parse(message.ToArray());
                var value = json.RootElement;
                if (value.TryGetProperty("id", out var id) && _pending.TryGetValue(id.GetInt32(), out var pending))
                    pending.TrySetResult(value.Clone());
                else if (value.TryGetProperty("method", out var method) && method.GetString() == "Runtime.bindingCalled")
                {
                    var parameters = value.GetProperty("params");
                    if (parameters.GetProperty("name").GetString() == "__codexTokenRequest")
                        Binding?.Invoke(parameters.GetProperty("payload").GetString()!);
                }
            }
        }
        catch (Exception error) when (error is WebSocketException or OperationCanceledException or JsonException) { }
        finally { foreach (var pending in _pending.Values) pending.TrySetCanceled(); }
    }

    public void Dispose()
    {
        _stop.Cancel();
        _socket.Dispose();
    }
}
