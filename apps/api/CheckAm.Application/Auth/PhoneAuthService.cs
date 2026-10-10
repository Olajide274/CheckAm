using System.Security.Cryptography;
using System.Text;
using System.ComponentModel.DataAnnotations;

namespace CheckAm.Application.Auth;

public sealed class PhoneAuthService(
    IPhoneAuthStore store,
    IOtpSender otpSender,
    byte[] otpHashKey,
    TimeProvider timeProvider) : IPhoneAuthService
{
    private static readonly TimeSpan OtpLifetime = TimeSpan.FromMinutes(5);
    private static readonly TimeSpan SessionLifetime = TimeSpan.FromDays(30);
    private const int MaxOtpAttempts = 5;

    public async Task<OtpRequestResult> RequestOtpAsync(
        string? phoneNumber,
        string clientIp,
        CancellationToken cancellationToken)
    {
        var normalizedPhone = PhoneNumberNormalizer.NormalizeNigerianPhoneNumber(phoneNumber);
        if (string.IsNullOrWhiteSpace(clientIp))
        {
            throw new ValidationException("The request could not be validated.");
        }

        var now = timeProvider.GetUtcNow();
        var phoneKey = HashKey($"phone:{normalizedPhone}");
        var ipKey = HashKey($"ip:{clientIp}");
        if (!await store.TryAcquireOtpRequestAsync(
            phoneKey,
            ipKey,
            now,
            cancellationToken))
        {
            return OtpRequestResult.RateLimited;
        }

        var code = RandomNumberGenerator.GetInt32(0, 1_000_000).ToString("D6");
        var challengeId = Guid.NewGuid();
        await store.CreateOtpChallengeAsync(
            challengeId,
            phoneKey,
            HashOtp(challengeId, code),
            now,
            now.Add(OtpLifetime),
            cancellationToken);
        await otpSender.SendAsync(normalizedPhone, code, cancellationToken);

        return OtpRequestResult.Accepted;
    }

    public async Task<OtpVerificationResult> VerifyOtpAsync(
        string? phoneNumber,
        string? code,
        CancellationToken cancellationToken)
    {
        var normalizedPhone = PhoneNumberNormalizer.NormalizeNigerianPhoneNumber(phoneNumber);
        if (code is null || code.Length != 6 || code.Any(character => !char.IsAsciiDigit(character)))
        {
            return new OtpVerificationResult(OtpVerificationStatus.InvalidOrExpired);
        }

        var now = timeProvider.GetUtcNow();
        var phoneKey = HashKey($"phone:{normalizedPhone}");
        var challenge = await store.GetActiveOtpChallengeAsync(
            phoneKey,
            now,
            cancellationToken);
        if (challenge is null)
        {
            return new OtpVerificationResult(OtpVerificationStatus.InvalidOrExpired);
        }

        if (challenge.FailedAttempts >= MaxOtpAttempts)
        {
            return new OtpVerificationResult(OtpVerificationStatus.RateLimited);
        }

        var suppliedHash = HashOtp(challenge.Id, code);
        var storedHash = Convert.FromHexString(challenge.CodeHash);
        var suppliedHashBytes = Convert.FromHexString(suppliedHash);
        var isCorrect = CryptographicOperations.FixedTimeEquals(storedHash, suppliedHashBytes);
        var recorded = await store.RecordOtpAttemptAsync(
            challenge.Id,
            now,
            isCorrect,
            cancellationToken);

        if (!recorded)
        {
            return new OtpVerificationResult(OtpVerificationStatus.InvalidOrExpired);
        }

        if (!isCorrect)
        {
            var updatedChallenge = await store.GetActiveOtpChallengeAsync(
                phoneKey,
                now,
                cancellationToken);
            return new OtpVerificationResult(
                updatedChallenge?.FailedAttempts >= MaxOtpAttempts
                    ? OtpVerificationStatus.RateLimited
                    : OtpVerificationStatus.InvalidOrExpired);
        }

        var tokenBytes = RandomNumberGenerator.GetBytes(32);
        var token = Convert.ToBase64String(tokenBytes)
            .TrimEnd('=')
            .Replace('+', '-')
            .Replace('/', '_');
        await store.CreateSessionAsync(
            Guid.NewGuid(),
            HashKey($"session:{token}"),
            now,
            now.Add(SessionLifetime),
            cancellationToken);

        return new OtpVerificationResult(OtpVerificationStatus.Authenticated, token);
    }

    public Task<bool> IsSessionValidAsync(
        string? sessionToken,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrEmpty(sessionToken) || sessionToken.Length > 128)
        {
            return Task.FromResult(false);
        }

        return store.IsSessionValidAsync(
            HashKey($"session:{sessionToken}"),
            timeProvider.GetUtcNow(),
            cancellationToken);
    }

    public Task RevokeSessionAsync(string? sessionToken, CancellationToken cancellationToken)
    {
        if (string.IsNullOrEmpty(sessionToken) || sessionToken.Length > 128)
        {
            return Task.CompletedTask;
        }

        return store.RevokeSessionAsync(
            HashKey($"session:{sessionToken}"),
            timeProvider.GetUtcNow(),
            cancellationToken);
    }

    private string HashOtp(Guid challengeId, string code)
    {
        var data = Encoding.UTF8.GetBytes($"{challengeId:N}:{code}");
        return Convert.ToHexString(HMACSHA256.HashData(otpHashKey, data));
    }

    private string HashKey(string value) =>
        Convert.ToHexString(HMACSHA256.HashData(otpHashKey, Encoding.UTF8.GetBytes(value)));
}
