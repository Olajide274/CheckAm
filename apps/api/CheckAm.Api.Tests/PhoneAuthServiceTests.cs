using CheckAm.Application.Auth;
using CheckAm.Infrastructure;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Xunit;

namespace CheckAm.Api.Tests;

public sealed class PhoneAuthServiceTests
{
    private static readonly DateTimeOffset Now =
        new(2026, 10, 10, 12, 0, 0, TimeSpan.Zero);

    [Fact]
    public async Task Request_stores_a_hash_and_sends_a_short_lived_six_digit_code()
    {
        var store = new FakePhoneAuthStore();
        var sender = new CapturingOtpSender();
        var service = CreateService(store, sender);

        var result = await service.RequestOtpAsync(
            "08012345678",
            "127.0.0.1",
            CancellationToken.None);

        Assert.Equal(OtpRequestResult.Accepted, result);
        Assert.Equal("+2348012345678", sender.PhoneNumber);
        Assert.NotEqual("+2348012345678", store.PhoneKey);
        Assert.Equal(64, store.PhoneKey?.Length);
        Assert.NotNull(sender.Code);
        Assert.Equal(6, sender.Code.Length);
        Assert.All(sender.Code, character => Assert.InRange(character, '0', '9'));
        Assert.NotEqual(sender.Code, store.CodeHash);
        Assert.Equal(Now.AddMinutes(5), store.ChallengeExpiresAt);
    }

    [Fact]
    public async Task Verification_is_single_use_and_creates_a_hashed_session()
    {
        var store = new FakePhoneAuthStore();
        var sender = new CapturingOtpSender();
        var service = CreateService(store, sender);
        await service.RequestOtpAsync(
            "08012345678",
            "127.0.0.1",
            CancellationToken.None);

        var verified = await service.VerifyOtpAsync(
            "+2348012345678",
            sender.Code,
            CancellationToken.None);
        var replay = await service.VerifyOtpAsync(
            "2348012345678",
            sender.Code,
            CancellationToken.None);

        Assert.Equal(OtpVerificationStatus.Authenticated, verified.Status);
        Assert.NotNull(verified.SessionToken);
        Assert.NotEqual(verified.SessionToken, store.SessionTokenHash);
        Assert.Equal(OtpVerificationStatus.InvalidOrExpired, replay.Status);
        Assert.True(await service.IsSessionValidAsync(
            verified.SessionToken,
            CancellationToken.None));
    }

    [Fact]
    public async Task Expired_code_cannot_be_verified()
    {
        var store = new FakePhoneAuthStore();
        var sender = new CapturingOtpSender();
        var clock = new TestTimeProvider(Now);
        var service = CreateService(store, sender, clock);
        await service.RequestOtpAsync(
            "08012345678",
            "127.0.0.1",
            CancellationToken.None);
        clock.Advance(TimeSpan.FromMinutes(6));

        var result = await service.VerifyOtpAsync(
            "08012345678",
            sender.Code,
            CancellationToken.None);

        Assert.Equal(OtpVerificationStatus.InvalidOrExpired, result.Status);
    }

    [Fact]
    public async Task Request_throttle_does_not_send_a_code()
    {
        var store = new FakePhoneAuthStore { AllowRequest = false };
        var sender = new CapturingOtpSender();
        var service = CreateService(store, sender);

        var result = await service.RequestOtpAsync(
            "08012345678",
            "127.0.0.1",
            CancellationToken.None);

        Assert.Equal(OtpRequestResult.RateLimited, result);
        Assert.Null(sender.Code);
        Assert.Null(store.CodeHash);
    }

    [Fact]
    public async Task Five_incorrect_codes_rate_limit_the_challenge()
    {
        var store = new FakePhoneAuthStore();
        var sender = new CapturingOtpSender();
        var service = CreateService(store, sender);
        await service.RequestOtpAsync(
            "08012345678",
            "127.0.0.1",
            CancellationToken.None);
        var wrongCode = sender.Code == "000000" ? "000001" : "000000";

        for (var attempt = 0; attempt < 4; attempt++)
        {
            var failed = await service.VerifyOtpAsync(
                "08012345678",
                wrongCode,
                CancellationToken.None);
            Assert.Equal(OtpVerificationStatus.InvalidOrExpired, failed.Status);
        }

        var limited = await service.VerifyOtpAsync(
            "08012345678",
            wrongCode,
            CancellationToken.None);

        Assert.Equal(OtpVerificationStatus.RateLimited, limited.Status);
    }

    [Fact]
    public async Task Development_sender_does_not_log_phone_numbers_or_otp_codes()
    {
        const string phoneNumber = "+2348012345678";
        const string code = "123456";
        var loggerProvider = new CapturingLoggerProvider();
        var configuration = CreateInfrastructureConfiguration();
        var services = new ServiceCollection();
        services.AddLogging(logging => logging.AddProvider(loggerProvider));
        services.AddInfrastructure(configuration, isDevelopment: true);
        using var provider = services.BuildServiceProvider();
        var sender = provider.GetRequiredService<IOtpSender>();

        await sender.SendAsync(phoneNumber, code, CancellationToken.None);

        var log = Assert.Single(loggerProvider.Messages);
        Assert.Contains("delivery is disabled", log);
        Assert.DoesNotContain(phoneNumber, log);
        Assert.DoesNotContain(code, log);
    }

    [Fact]
    public async Task Development_sender_logs_only_the_code_when_opted_in()
    {
        const string phoneNumber = "+2348012345678";
        const string code = "123456";
        var loggerProvider = new CapturingLoggerProvider();
        var services = new ServiceCollection();
        services.AddLogging(logging => logging.AddProvider(loggerProvider));
        services.AddInfrastructure(
            CreateInfrastructureConfiguration("true"),
            isDevelopment: true);
        using var provider = services.BuildServiceProvider();
        var sender = provider.GetRequiredService<IOtpSender>();

        await sender.SendAsync(phoneNumber, code, CancellationToken.None);

        var log = Assert.Single(loggerProvider.Messages);
        Assert.Contains(code, log);
        Assert.DoesNotContain(phoneNumber, log);
    }

    [Fact]
    public void Development_sender_is_not_registered_outside_development()
    {
        var services = new ServiceCollection();

        var exception = Assert.Throws<InvalidOperationException>(
            () => services.AddInfrastructure(
                CreateInfrastructureConfiguration(),
                isDevelopment: false));

        Assert.Contains("SMS provider is not supported", exception.Message);
    }

    [Fact]
    public void Development_otp_logging_cannot_be_enabled_outside_development()
    {
        var services = new ServiceCollection();

        var exception = Assert.Throws<InvalidOperationException>(
            () => services.AddInfrastructure(
                CreateInfrastructureConfiguration("true"),
                isDevelopment: false));

        Assert.Contains("only be enabled in the Development environment", exception.Message);
    }

    private static PhoneAuthService CreateService(
        FakePhoneAuthStore store,
        CapturingOtpSender sender,
        TestTimeProvider? clock = null) =>
        new(
            store,
            sender,
            new byte[32],
            clock ?? new TestTimeProvider(Now));

    private static IConfiguration CreateInfrastructureConfiguration(string? logOtp = null) =>
        new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ConnectionStrings:DefaultConnection"] =
                    "Host=localhost;Database=checkam;Username=postgres;Password=test",
                ["Auth:DevelopmentLogOtp"] = logOtp
            })
            .Build();

    private sealed class CapturingLoggerProvider : ILoggerProvider
    {
        public List<string> Messages { get; } = [];

        public ILogger CreateLogger(string categoryName) => new CapturingLogger(Messages);

        public void Dispose()
        {
        }
    }

    private sealed class CapturingLogger(List<string> messages) : ILogger
    {
        public IDisposable? BeginScope<TState>(TState state)
            where TState : notnull => null;

        public bool IsEnabled(LogLevel logLevel) => true;

        public void Log<TState>(
            LogLevel logLevel,
            EventId eventId,
            TState state,
            Exception? exception,
            Func<TState, Exception?, string> formatter) =>
            messages.Add(formatter(state, exception));
    }

    private sealed class CapturingOtpSender : IOtpSender
    {
        public string? Code { get; private set; }
        public string? PhoneNumber { get; private set; }

        public Task SendAsync(
            string phoneNumber,
            string code,
            CancellationToken cancellationToken)
        {
            PhoneNumber = phoneNumber;
            Code = code;
            return Task.CompletedTask;
        }
    }

    private sealed class FakePhoneAuthStore : IPhoneAuthStore
    {
        private OtpChallengeRecord? _challenge;
        private DateTimeOffset _sessionExpiresAt;
        private bool _challengeConsumed;
        private bool _sessionRevoked;
        private int _failedAttempts;

        public bool AllowRequest { get; init; } = true;
        public string? PhoneKey { get; private set; }
        public string? CodeHash { get; private set; }
        public DateTimeOffset ChallengeExpiresAt { get; private set; }
        public string? SessionTokenHash { get; private set; }

        public Task<bool> TryAcquireOtpRequestAsync(
            string phoneKey,
            string ipKey,
            DateTimeOffset now,
            CancellationToken cancellationToken) =>
            Task.FromResult(AllowRequest);

        public Task CreateOtpChallengeAsync(
            Guid id,
            string phoneKey,
            string codeHash,
            DateTimeOffset now,
            DateTimeOffset expiresAt,
            CancellationToken cancellationToken)
        {
            PhoneKey = phoneKey;
            CodeHash = codeHash;
            ChallengeExpiresAt = expiresAt;
            _challenge = new OtpChallengeRecord(id, codeHash, expiresAt, 0);
            _challengeConsumed = false;
            _failedAttempts = 0;
            return Task.CompletedTask;
        }

        public Task<OtpChallengeRecord?> GetActiveOtpChallengeAsync(
            string phoneKey,
            DateTimeOffset now,
            CancellationToken cancellationToken)
        {
            if (PhoneKey != phoneKey
                || _challengeConsumed
                || _challenge is null
                || _challenge.ExpiresAt <= now)
            {
                return Task.FromResult<OtpChallengeRecord?>(null);
            }

            return Task.FromResult<OtpChallengeRecord?>(_challenge with
            {
                FailedAttempts = _failedAttempts
            });
        }

        public Task<bool> RecordOtpAttemptAsync(
            Guid challengeId,
            DateTimeOffset now,
            bool isCorrect,
            CancellationToken cancellationToken)
        {
            if (_challenge is null
                || _challenge.Id != challengeId
                || _challengeConsumed
                || _challenge.ExpiresAt <= now
                || _failedAttempts >= 5)
            {
                return Task.FromResult(false);
            }

            if (isCorrect)
            {
                _challengeConsumed = true;
            }
            else
            {
                _failedAttempts++;
            }

            return Task.FromResult(true);
        }

        public Task CreateSessionAsync(
            Guid id,
            string tokenHash,
            DateTimeOffset now,
            DateTimeOffset expiresAt,
            CancellationToken cancellationToken)
        {
            SessionTokenHash = tokenHash;
            _sessionExpiresAt = expiresAt;
            _sessionRevoked = false;
            return Task.CompletedTask;
        }

        public Task<bool> IsSessionValidAsync(
            string tokenHash,
            DateTimeOffset now,
            CancellationToken cancellationToken) =>
            Task.FromResult(
                SessionTokenHash == tokenHash
                && !_sessionRevoked
                && _sessionExpiresAt > now);

        public Task RevokeSessionAsync(
            string tokenHash,
            DateTimeOffset now,
            CancellationToken cancellationToken)
        {
            if (SessionTokenHash == tokenHash)
            {
                _sessionRevoked = true;
            }

            return Task.CompletedTask;
        }
    }

    private sealed class TestTimeProvider(DateTimeOffset now) : TimeProvider
    {
        private DateTimeOffset _now = now;

        public override DateTimeOffset GetUtcNow() => _now;

        public void Advance(TimeSpan amount) => _now = _now.Add(amount);
    }
}
