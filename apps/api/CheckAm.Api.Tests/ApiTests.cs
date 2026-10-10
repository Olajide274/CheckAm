using System.ComponentModel.DataAnnotations;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using CheckAm.Api;
using CheckAm.Application.Auth;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Logging;
using Xunit;

namespace CheckAm.Api.Tests;

public sealed class ApiTests
{
    [Fact]
    public async Task Health_returns_ok()
    {
        await using var factory = CreateFactory();
        using var client = factory.CreateClient();

        using var response = await client.GetAsync("/health");
        using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("ok", body.RootElement.GetProperty("status").GetString());
    }

    [Fact]
    public async Task Swagger_is_available_in_development()
    {
        await using var factory = CreateFactory();
        using var client = factory.CreateClient();

        using var response = await client.GetAsync("/swagger/v1/swagger.json");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Unknown_routes_return_problem_details()
    {
        await using var factory = CreateFactory();
        using var client = factory.CreateClient();

        using var response = await client.GetAsync("/not-found");
        using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal(404, body.RootElement.GetProperty("status").GetInt32());
        Assert.StartsWith("application/problem+json", response.Content.Headers.ContentType?.MediaType);
    }

    [Fact]
    public async Task Health_is_rate_limited_with_problem_details()
    {
        await using var factory = CreateFactory();
        using var client = factory.CreateClient();
        HttpResponseMessage? lastResponse = null;

        for (var request = 0; request < 101; request++)
        {
            lastResponse?.Dispose();
            lastResponse = await client.GetAsync("/health");
        }

        using var response = lastResponse
            ?? throw new InvalidOperationException("No response was received.");

        Assert.Equal(HttpStatusCode.TooManyRequests, response.StatusCode);
        Assert.Equal(TimeSpan.FromSeconds(60), response.Headers.RetryAfter?.Delta);
        Assert.StartsWith(
            "application/problem+json",
            response.Content.Headers.ContentType?.MediaType);
    }

    [Fact]
    public async Task Validation_exceptions_return_problem_details_without_input_values()
    {
        var (handler, provider) = CreateHandler();
        using (provider)
        {
            var context = CreateHttpContext(provider);
            var exception = new ValidationException(
                new ValidationResult("Sensitive input", ["DeviceId"]),
                validatingAttribute: null,
                value: "private input");

            var handled = await handler.TryHandleAsync(context, exception, CancellationToken.None);
            context.Response.Body.Position = 0;
            using var body = await JsonDocument.ParseAsync(context.Response.Body);

            Assert.True(handled);
            Assert.Equal(StatusCodes.Status400BadRequest, context.Response.StatusCode);
            Assert.Equal("Validation failed", body.RootElement.GetProperty("title").GetString());
            Assert.DoesNotContain("Sensitive input", body.RootElement.ToString());
            Assert.Equal(
                "The provided value is invalid.",
                body.RootElement.GetProperty("errors").GetProperty("DeviceId")[0].GetString());
        }
    }

    [Fact]
    public async Task Unhandled_exceptions_return_generic_problem_details()
    {
        var (handler, provider) = CreateHandler();
        using (provider)
        {
            var context = CreateHttpContext(provider);

            var handled = await handler.TryHandleAsync(
                context,
                new InvalidOperationException("Sensitive internal detail"),
                CancellationToken.None);
            context.Response.Body.Position = 0;
            using var body = await JsonDocument.ParseAsync(context.Response.Body);

            Assert.True(handled);
            Assert.Equal(StatusCodes.Status500InternalServerError, context.Response.StatusCode);
            Assert.Equal(
                "An unexpected error occurred",
                body.RootElement.GetProperty("title").GetString());
            Assert.DoesNotContain("Sensitive internal detail", body.RootElement.ToString());
        }
    }

    [Theory]
    [InlineData("+234 801 234 5678", "+2348012345678")]
    [InlineData("08012345678", "+2348012345678")]
    [InlineData("2348012345678", "+2348012345678")]
    [InlineData("8012345678", "+2348012345678")]
    public void Nigerian_phone_numbers_are_normalized_to_e164(
        string input,
        string expected)
    {
        Assert.Equal(expected, PhoneNumberNormalizer.NormalizeNigerianPhoneNumber(input));
    }

    [Theory]
    [InlineData("0801234567")]
    [InlineData("+1 202 555 0100")]
    [InlineData("+234abc8012345678")]
    [InlineData("+2346012345678")]
    public void Invalid_phone_numbers_are_rejected(string input)
    {
        Assert.Throws<ValidationException>(
            () => PhoneNumberNormalizer.NormalizeNigerianPhoneNumber(input));
    }

    [Fact]
    public async Task Request_otp_returns_a_problem_details_rate_limit()
    {
        var authService = new FakePhoneAuthService
        {
            RequestResult = OtpRequestResult.RateLimited
        };
        await using var factory = CreateFactory(authService);
        using var client = factory.CreateClient();

        using var response = await client.PostAsJsonAsync(
            "/auth/otp/request",
            new { phoneNumber = "08012345678" });
        using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());

        Assert.Equal(HttpStatusCode.TooManyRequests, response.StatusCode);
        Assert.Equal(TimeSpan.FromSeconds(600), response.Headers.RetryAfter?.Delta);
        Assert.Equal(
            "Too many code requests",
            body.RootElement.GetProperty("title").GetString());
        Assert.StartsWith(
            "application/problem+json",
            response.Content.Headers.ContentType?.MediaType);
    }

    [Fact]
    public async Task Verify_otp_sets_an_httponly_same_site_session_cookie()
    {
        var authService = new FakePhoneAuthService
        {
            VerificationResult = new OtpVerificationResult(
                OtpVerificationStatus.Authenticated,
                "opaque-session-token")
        };
        await using var factory = CreateFactory(authService);
        using var client = factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            BaseAddress = new Uri("https://localhost")
        });

        using var response = await client.PostAsJsonAsync(
            "/auth/otp/verify",
            new { phoneNumber = "08012345678", code = "123456" });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var cookie = Assert.Single(response.Headers.GetValues("Set-Cookie"));
        Assert.Contains("checkam_session=opaque-session-token", cookie);
        Assert.Contains("httponly", cookie, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("secure", cookie, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("samesite=lax", cookie, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Invalid_phone_request_has_a_clear_problem_details_message()
    {
        var authService = new FakePhoneAuthService
        {
            RequestException = new ValidationException("Enter a valid Nigerian mobile number.")
        };
        await using var factory = CreateFactory(authService);
        using var client = factory.CreateClient();

        using var response = await client.PostAsJsonAsync(
            "/auth/otp/request",
            new { phoneNumber = "not a phone number" });
        using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(
            "Enter a valid Nigerian mobile number.",
            body.RootElement.GetProperty("detail").GetString());
    }

    private static WebApplicationFactory<Program> CreateFactory(
        FakePhoneAuthService? authService = null) =>
        new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment("Development");
            builder.UseSetting(
                "Auth:OtpHashKey",
                "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=");
            builder.ConfigureServices(services =>
            {
                services.RemoveAll<IPhoneAuthService>();
                services.AddSingleton<IPhoneAuthService>(
                    authService ?? new FakePhoneAuthService());
            });
            builder.UseSetting(
                "ConnectionStrings:DefaultConnection",
                "Host=localhost;Database=checkam;Username=postgres;Password=test");
        });

    private static (GlobalExceptionHandler Handler, ServiceProvider Provider) CreateHandler()
    {
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddProblemDetails();
        var provider = services.BuildServiceProvider();
        var handler = new GlobalExceptionHandler(
            provider.GetRequiredService<IProblemDetailsService>(),
            provider.GetRequiredService<ILogger<GlobalExceptionHandler>>());
        return (handler, provider);
    }

    private static DefaultHttpContext CreateHttpContext(IServiceProvider services)
    {
        var context = new DefaultHttpContext
        {
            RequestServices = services,
            TraceIdentifier = "test-trace"
        };
        context.Response.Body = new MemoryStream();
        context.Request.Path = "/test";
        return context;
    }

    private sealed class FakePhoneAuthService : IPhoneAuthService
    {
        public OtpRequestResult RequestResult { get; init; } = OtpRequestResult.Accepted;
        public OtpVerificationResult VerificationResult { get; init; } =
            new(OtpVerificationStatus.InvalidOrExpired);
        public ValidationException? RequestException { get; init; }
        public bool SessionValid { get; init; } = true;

        public Task<OtpRequestResult> RequestOtpAsync(
            string? phoneNumber,
            string clientIp,
            CancellationToken cancellationToken)
        {
            if (RequestException is not null)
            {
                throw RequestException;
            }

            return Task.FromResult(RequestResult);
        }

        public Task<OtpVerificationResult> VerifyOtpAsync(
            string? phoneNumber,
            string? code,
            CancellationToken cancellationToken) =>
            Task.FromResult(VerificationResult);

        public Task<bool> IsSessionValidAsync(
            string? sessionToken,
            CancellationToken cancellationToken) =>
            Task.FromResult(SessionValid && sessionToken == "opaque-session-token");

        public Task RevokeSessionAsync(
            string? sessionToken,
            CancellationToken cancellationToken) =>
            Task.CompletedTask;
    }
}
