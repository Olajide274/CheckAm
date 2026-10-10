namespace CheckAm.Application.Auth;

public enum OtpRequestResult
{
    Accepted,
    RateLimited
}

public enum OtpVerificationStatus
{
    Authenticated,
    InvalidOrExpired,
    RateLimited
}

public sealed record OtpVerificationResult(
    OtpVerificationStatus Status,
    string? SessionToken = null);

public sealed record OtpChallengeRecord(
    Guid Id,
    string CodeHash,
    DateTimeOffset ExpiresAt,
    int FailedAttempts);

public interface IPhoneAuthService
{
    Task<OtpRequestResult> RequestOtpAsync(
        string? phoneNumber,
        string clientIp,
        CancellationToken cancellationToken);

    Task<OtpVerificationResult> VerifyOtpAsync(
        string? phoneNumber,
        string? code,
        CancellationToken cancellationToken);

    Task<bool> IsSessionValidAsync(string? sessionToken, CancellationToken cancellationToken);

    Task RevokeSessionAsync(string? sessionToken, CancellationToken cancellationToken);
}

public interface IPhoneAuthStore
{
    Task<bool> TryAcquireOtpRequestAsync(
        string phoneKey,
        string ipKey,
        DateTimeOffset now,
        CancellationToken cancellationToken);

    Task CreateOtpChallengeAsync(
        Guid id,
        string phoneKey,
        string codeHash,
        DateTimeOffset now,
        DateTimeOffset expiresAt,
        CancellationToken cancellationToken);

    Task<OtpChallengeRecord?> GetActiveOtpChallengeAsync(
        string phoneKey,
        DateTimeOffset now,
        CancellationToken cancellationToken);

    Task<bool> RecordOtpAttemptAsync(
        Guid challengeId,
        DateTimeOffset now,
        bool isCorrect,
        CancellationToken cancellationToken);

    Task CreateSessionAsync(
        Guid id,
        string tokenHash,
        DateTimeOffset now,
        DateTimeOffset expiresAt,
        CancellationToken cancellationToken);

    Task<bool> IsSessionValidAsync(
        string tokenHash,
        DateTimeOffset now,
        CancellationToken cancellationToken);

    Task RevokeSessionAsync(
        string tokenHash,
        DateTimeOffset now,
        CancellationToken cancellationToken);
}

public interface IOtpSender
{
    Task SendAsync(string phoneNumber, string code, CancellationToken cancellationToken);
}
