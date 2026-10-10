using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;

namespace CheckAm.Api;

public sealed class GlobalExceptionHandler(
    IProblemDetailsService problemDetailsService,
    ILogger<GlobalExceptionHandler> logger) : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(
        HttpContext httpContext,
        Exception exception,
        CancellationToken cancellationToken)
    {
        var isValidationError = exception is ValidationException;
        var status = isValidationError
            ? StatusCodes.Status400BadRequest
            : StatusCodes.Status500InternalServerError;

        if (isValidationError)
        {
            logger.LogInformation(
                "Request validation failed for {Method} {Endpoint}",
                httpContext.Request.Method,
                httpContext.GetEndpoint()?.DisplayName ?? "unmatched");
        }
        else
        {
            logger.LogError(
                exception,
                "Unhandled exception for {Method} {Endpoint}",
                httpContext.Request.Method,
                httpContext.GetEndpoint()?.DisplayName ?? "unmatched");
        }

        var problemDetails = new ProblemDetails
        {
            Status = status,
            Title = isValidationError ? "Validation failed" : "An unexpected error occurred",
            Detail = isValidationError
                ? "One or more validation errors occurred."
                : "The request could not be completed.",
        };
        problemDetails.Extensions["traceId"] = httpContext.TraceIdentifier;

        if (exception is ValidationException validationException)
        {
            var memberNames = validationException.ValidationResult?.MemberNames ?? [];
            problemDetails.Extensions["errors"] = memberNames
                .Distinct(StringComparer.Ordinal)
                .ToDictionary(name => name, _ => new[] { "The provided value is invalid." });
        }

        httpContext.Response.StatusCode = status;
        await problemDetailsService.WriteAsync(new ProblemDetailsContext
        {
            HttpContext = httpContext,
            ProblemDetails = problemDetails
        });

        return true;
    }
}
