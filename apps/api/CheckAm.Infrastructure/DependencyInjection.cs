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

        services.AddDbContext<CheckAmDbContext>(options => options.UseNpgsql(connectionString));
        services.AddScoped<IPhoneAuthStore, PhoneAuthStore>();
        if (isDevelopment && (configuration["Sms:Provider"] is null or "console"))
        {
            services.AddSingleton<IOtpSender, DevelopmentOtpSender>();
        }
        else
        {
            throw new InvalidOperationException(
                "The configured SMS provider is not supported by this API build.");
        }

        return services;
    }
}

internal sealed class DevelopmentOtpSender(ILogger<DevelopmentOtpSender> logger) : IOtpSender
{
    public Task SendAsync(
        string phoneNumber,
        string code,
        CancellationToken cancellationToken)
    {
        logger.LogInformation(
            "Development OTP for {PhoneNumber}: {OtpCode}",
            phoneNumber,
            code);
        return Task.CompletedTask;
    }
}
