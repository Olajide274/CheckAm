using System.Threading.RateLimiting;
using CheckAm.Api;
using CheckAm.Application.Auth;
using CheckAm.Infrastructure;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

var builder = WebApplication.CreateBuilder(args);

builder.Logging.AddJsonConsole();
builder.Services.AddProblemDetails();
builder.Services.AddExceptionHandler<GlobalExceptionHandler>();
builder.Services.AddInfrastructure(builder.Configuration, builder.Environment.IsDevelopment());
var otpHashKeySetting = builder.Configuration["Auth:OtpHashKey"]
    ?? throw new InvalidOperationException(
        "Set the Auth__OtpHashKey environment variable to a base64-encoded key of at least 32 bytes.");
byte[] otpHashKey;
try
{
    otpHashKey = Convert.FromBase64String(otpHashKeySetting);
}
catch (FormatException exception)
{
    throw new InvalidOperationException(
        "Auth__OtpHashKey must be a base64-encoded key of at least 32 bytes.",
        exception);
}

if (otpHashKey.Length < 32)
{
    throw new InvalidOperationException(
        "Auth__OtpHashKey must be a base64-encoded key of at least 32 bytes.");
}

builder.Services.AddSingleton<TimeProvider>(TimeProvider.System);
builder.Services.AddScoped<IPhoneAuthService>(services =>
    new PhoneAuthService(
        services.GetRequiredService<IPhoneAuthStore>(),
        services.GetRequiredService<IOtpSender>(),
        otpHashKey,
        services.GetRequiredService<TimeProvider>()));
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(context =>
        RateLimitPartition.GetFixedWindowLimiter(
            context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            _ => new FixedWindowRateLimiterOptions
            {
                AutoReplenishment = true,
                PermitLimit = 100,
                QueueLimit = 0,
                Window = TimeSpan.FromMinutes(1)
            }));
    options.OnRejected = async (context, cancellationToken) =>
    {
        context.HttpContext.Response.Headers["Retry-After"] = "60";
        var problemDetailsService = context.HttpContext.RequestServices
            .GetRequiredService<IProblemDetailsService>();

        await problemDetailsService.WriteAsync(new ProblemDetailsContext
        {
            HttpContext = context.HttpContext,
            ProblemDetails = new ProblemDetails
            {
                Status = StatusCodes.Status429TooManyRequests,
                Title = "Too many requests",
                Detail = "The request limit has been reached. Try again later."
            }
        });
    };
});

var app = builder.Build();

app.UseMiddleware<RequestLoggingMiddleware>();
app.UseExceptionHandler();
app.UseStatusCodePages();
app.UseRateLimiter();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.MapGet("/health", () => Results.Ok(new { status = "ok" }))
    .WithName("GetHealth");
app.MapPhoneAuthEndpoints(builder.Configuration, builder.Environment);

app.Run();

public partial class Program { }
