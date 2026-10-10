using System.Diagnostics;

namespace CheckAm.Api;

public sealed class RequestLoggingMiddleware(
    RequestDelegate next,
    ILogger<RequestLoggingMiddleware> logger)
{
    public async Task InvokeAsync(HttpContext context)
    {
        var stopwatch = Stopwatch.StartNew();
        try
        {
            await next(context);
        }
        finally
        {
            stopwatch.Stop();
            logger.LogInformation(
                "HTTP {Method} {Endpoint} responded {StatusCode} in {ElapsedMilliseconds} ms",
                context.Request.Method,
                context.GetEndpoint()?.DisplayName ?? "unmatched",
                context.Response.StatusCode,
                stopwatch.ElapsedMilliseconds);
        }
    }
}
