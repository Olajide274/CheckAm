using System.ComponentModel.DataAnnotations;
using CheckAm.Application.Auth;
using Microsoft.AspNetCore.Mvc;

namespace CheckAm.Api;

public static class PhoneAuthEndpoints
{
    private const string DefaultCookieName = "checkam_session";
    private static readonly TimeSpan SessionLifetime = TimeSpan.FromDays(30);

    public static IEndpointRouteBuilder MapPhoneAuthEndpoints(
        this IEndpointRouteBuilder endpoints,
        IConfiguration configuration,
        IHostEnvironment environment)
    {
        var group = endpoints.MapGroup("/auth");
        group.MapPost("/otp/request", RequestOtpAsync).WithName("RequestPhoneOtp");
        group.MapPost("/otp/verify", VerifyOtpAsync).WithName("VerifyPhoneOtp");
        group.MapGet("/session", GetSessionAsync).WithName("GetPhoneSession");
        group.MapPost("/logout", LogoutAsync).WithName("LogoutPhoneSession");

        return endpoints;

        async Task<IResult> RequestOtpAsync(
            RequestOtpBody body,
            HttpContext context,
            IPhoneAuthService authService,
            CancellationToken cancellationToken)
        {
            try
            {
                var result = await authService.RequestOtpAsync(
                    body.PhoneNumber,
                    context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
                    cancellationToken);
                if (result == OtpRequestResult.RateLimited)
                {
                    context.Response.Headers["Retry-After"] = "600";
                    return Problem(
                        StatusCodes.Status429TooManyRequests,
                        "Too many code requests",
                        "Wait a little before requesting another code.");
                }

                return Results.Accepted(
                    value: new { message = "If eligible, a sign-in code has been sent." });
            }
            catch (ValidationException exception)
            {
                return Problem(
                    StatusCodes.Status400BadRequest,
                    "Invalid phone number",
                    exception.Message);
            }
        }

        async Task<IResult> VerifyOtpAsync(
            VerifyOtpBody body,
            HttpContext context,
            IPhoneAuthService authService,
            CancellationToken cancellationToken)
        {
            OtpVerificationResult result;
            try
            {
                result = await authService.VerifyOtpAsync(
                    body.PhoneNumber,
                    body.Code,
                    cancellationToken);
            }
            catch (ValidationException exception)
            {
                return Problem(
                    StatusCodes.Status400BadRequest,
                    "Invalid phone number",
                    exception.Message);
            }

            if (result.Status == OtpVerificationStatus.RateLimited)
            {
                context.Response.Headers["Retry-After"] = "300";
                return Problem(
                    StatusCodes.Status429TooManyRequests,
                    "Too many code attempts",
                    "Request a new code later.");
            }

            if (result.Status != OtpVerificationStatus.Authenticated
                || string.IsNullOrEmpty(result.SessionToken))
            {
                return Problem(
                    StatusCodes.Status401Unauthorized,
                    "Code not accepted",
                    "That code is incorrect or expired. Request a new one and try again.");
            }

            context.Response.Cookies.Append(
                GetCookieName(configuration),
                result.SessionToken,
                CreateCookieOptions(configuration, environment, context));

            return Results.Ok(new { authenticated = true });
        }

        async Task<IResult> GetSessionAsync(
            HttpContext context,
            IPhoneAuthService authService,
            CancellationToken cancellationToken)
        {
            var token = context.Request.Cookies[GetCookieName(configuration)];
            if (!await authService.IsSessionValidAsync(token, cancellationToken))
            {
                return Problem(
                    StatusCodes.Status401Unauthorized,
                    "Sign-in required",
                    "Sign in to continue.");
            }

            return Results.Ok(new { authenticated = true });
        }

        async Task<IResult> LogoutAsync(
            HttpContext context,
            IPhoneAuthService authService,
            CancellationToken cancellationToken)
        {
            var cookieName = GetCookieName(configuration);
            await authService.RevokeSessionAsync(
                context.Request.Cookies[cookieName],
                cancellationToken);
            context.Response.Cookies.Delete(
                cookieName,
                CreateCookieOptions(configuration, environment, context));
            return Results.NoContent();
        }
    }

    private static string GetCookieName(IConfiguration configuration) =>
        configuration["Auth:CookieName"] ?? DefaultCookieName;

    private static CookieOptions CreateCookieOptions(
        IConfiguration configuration,
        IHostEnvironment environment,
        HttpContext context)
    {
        var options = new CookieOptions
        {
            HttpOnly = true,
            Secure = environment.IsProduction() || context.Request.IsHttps,
            SameSite = SameSiteMode.Lax,
            Path = "/",
            IsEssential = true,
            MaxAge = SessionLifetime,
            Expires = DateTimeOffset.UtcNow.Add(SessionLifetime)
        };
        var domain = configuration["Auth:CookieDomain"];
        if (!string.IsNullOrWhiteSpace(domain))
        {
            options.Domain = domain;
        }

        return options;
    }

    private static IResult Problem(int status, string title, string detail) =>
        Results.Problem(statusCode: status, title: title, detail: detail);

    public sealed record RequestOtpBody(string? PhoneNumber);
    public sealed record VerifyOtpBody(string? PhoneNumber, string? Code);
}
