using CheckAm.Application.Auth;
using CheckAm.Infrastructure.Auth;
using CheckAm.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace CheckAm.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(
        this IServiceCollection services,
        IConfiguration configuration,
        bool isDevelopment)
    {
        var connectionString = configuration.GetConnectionString("DefaultConnection");
        if (string.IsNullOrWhiteSpace(connectionString))
        {
            throw new InvalidOperationException(
                "Set the ConnectionStrings__DefaultConnection environment variable to connect to PostgreSQL.");
        }

        var logOtpSetting = configuration["Auth:DevelopmentLogOtp"];
        if (logOtpSetting is not null && !bool.TryParse(logOtpSetting, out _))
        {
            throw new InvalidOperationException(
                "Auth:DevelopmentLogOtp must be set to true or false.");
        }

        var logDevelopmentOtp = bool.TryParse(logOtpSetting, out var enabled) && enabled;
        if (logDevelopmentOtp && !isDevelopment)
        {
            throw new InvalidOperationException(
                "Auth:DevelopmentLogOtp can only be enabled in the Development environment.");
        }

        services.AddDbContext<CheckAmDbContext>(options => options.UseNpgsql(connectionString));
        services.AddScoped<IPhoneAuthStore, PhoneAuthStore>();
        if (isDevelopment && (configuration["Sms:Provider"] is null or "console"))
        {
            services.AddSingleton<IOtpSender>(
                serviceProvider => new DevelopmentOtpSender(
                    serviceProvider.GetRequiredService<ILogger<DevelopmentOtpSender>>(),
                    logDevelopmentOtp));
        }
        else
        {
            throw new InvalidOperationException(
                "The configured SMS provider is not supported by this API build.");
        }

        return services;
    }
}

internal sealed class DevelopmentOtpSender(
    ILogger<DevelopmentOtpSender> logger,
    bool logOtp) : IOtpSender
{
    public Task SendAsync(
        string phoneNumber,
        string code,
        CancellationToken cancellationToken)
    {
        if (logOtp)
        {
            logger.LogWarning("Development OTP code: {OtpCode}", code);
        }
        else
        {
            logger.LogWarning("Development OTP delivery is disabled; no code was sent.");
        }

        return Task.CompletedTask;
    }
}
