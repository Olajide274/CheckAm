using CheckAm.Application.Auth;
using CheckAm.Domain.Auth;
using CheckAm.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;

namespace CheckAm.Infrastructure.Auth;

public sealed class PhoneAuthStore(CheckAmDbContext dbContext) : IPhoneAuthStore
{
    private static readonly TimeSpan RequestWindow = TimeSpan.FromMinutes(10);
    private const int PhoneRequestLimit = 3;
    private const int IpRequestLimit = 10;
    private const int MaxOtpAttempts = 5;

    public async Task<bool> TryAcquireOtpRequestAsync(
        string phoneKey,
        string ipKey,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        await using var transaction = await dbContext.Database.BeginTransactionAsync(
            cancellationToken);
        await dbContext.OtpRateLimitBuckets
            .Where(bucket => bucket.WindowStartedAt <= now.Subtract(RequestWindow))
            .ExecuteDeleteAsync(cancellationToken);
        var phoneRequests = await IncrementRateLimitAsync(
            phoneKey,
            now,
            cancellationToken);
        var ipRequests = await IncrementRateLimitAsync(
            ipKey,
            now,
            cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        return phoneRequests <= PhoneRequestLimit && ipRequests <= IpRequestLimit;
    }

    public async Task CreateOtpChallengeAsync(
        Guid id,
        string phoneKey,
        string codeHash,
        DateTimeOffset now,
        DateTimeOffset expiresAt,
        CancellationToken cancellationToken)
    {
        await dbContext.OtpChallenges
            .Where(challenge => challenge.PhoneKey == phoneKey
                && challenge.ConsumedAt == null)
            .ExecuteUpdateAsync(
                updates => updates.SetProperty(challenge => challenge.ConsumedAt, now),
                cancellationToken);

        dbContext.OtpChallenges.Add(new OtpChallenge
        {
            Id = id,
            PhoneKey = phoneKey,
            CodeHash = codeHash,
            CreatedAt = now,
            ExpiresAt = expiresAt
        });
        await dbContext.SaveChangesAsync(cancellationToken);
    }

    public async Task<OtpChallengeRecord?> GetActiveOtpChallengeAsync(
        string phoneKey,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        var challenge = await dbContext.OtpChallenges
            .AsNoTracking()
            .Where(candidate => candidate.PhoneKey == phoneKey
                && candidate.ConsumedAt == null
                && candidate.ExpiresAt > now)
            .OrderByDescending(candidate => candidate.CreatedAt)
            .FirstOrDefaultAsync(cancellationToken);

        return challenge is null
            ? null
            : new OtpChallengeRecord(
                challenge.Id,
                challenge.CodeHash,
                challenge.ExpiresAt,
                challenge.FailedAttempts);
    }

    public async Task<bool> RecordOtpAttemptAsync(
        Guid challengeId,
        DateTimeOffset now,
        bool isCorrect,
        CancellationToken cancellationToken)
    {
        var updated = await dbContext.OtpChallenges
            .Where(challenge => challenge.Id == challengeId
                && challenge.ConsumedAt == null
                && challenge.ExpiresAt > now
                && challenge.FailedAttempts < MaxOtpAttempts)
            .ExecuteUpdateAsync(
                updates => isCorrect
                    ? updates.SetProperty(challenge => challenge.ConsumedAt, now)
                    : updates.SetProperty(
                        challenge => challenge.FailedAttempts,
                        challenge => challenge.FailedAttempts + 1),
                cancellationToken);

        return updated == 1;
    }

    public async Task CreateSessionAsync(
        Guid id,
        string tokenHash,
        DateTimeOffset now,
        DateTimeOffset expiresAt,
        CancellationToken cancellationToken)
    {
        dbContext.UserSessions.Add(new UserSession
        {
            Id = id,
            TokenHash = tokenHash,
            CreatedAt = now,
            ExpiresAt = expiresAt
        });
        await dbContext.SaveChangesAsync(cancellationToken);
    }

    public Task<bool> IsSessionValidAsync(
        string tokenHash,
        DateTimeOffset now,
        CancellationToken cancellationToken) =>
        dbContext.UserSessions.AnyAsync(
            session => session.TokenHash == tokenHash
                && session.RevokedAt == null
                && session.ExpiresAt > now,
            cancellationToken);

    public async Task RevokeSessionAsync(
        string tokenHash,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        await dbContext.UserSessions
            .Where(session => session.TokenHash == tokenHash && session.RevokedAt == null)
            .ExecuteUpdateAsync(
                updates => updates.SetProperty(session => session.RevokedAt, now),
                cancellationToken);
    }

    private async Task<int> IncrementRateLimitAsync(
        string key,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        var connection = dbContext.Database.GetDbConnection();
        await using var command = connection.CreateCommand();
        command.Transaction = dbContext.Database.CurrentTransaction?.GetDbTransaction();
        command.CommandText = """
            INSERT INTO "OtpRateLimitBuckets" ("Key", "WindowStartedAt", "Count")
            VALUES (@key, @now, 1)
            ON CONFLICT ("Key") DO UPDATE
            SET "Count" = CASE
                    WHEN "WindowStartedAt" <= @windowStart THEN 1
                    ELSE "Count" + 1
                END,
                "WindowStartedAt" = CASE
                    WHEN "WindowStartedAt" <= @windowStart THEN @now
                    ELSE "WindowStartedAt"
                END
            RETURNING "Count";
            """;
        AddParameter(command, "key", key);
        AddParameter(command, "now", now);
        AddParameter(command, "windowStart", now.Subtract(RequestWindow));
        var result = await command.ExecuteScalarAsync(cancellationToken);
        return Convert.ToInt32(result, System.Globalization.CultureInfo.InvariantCulture);
    }

    private static void AddParameter(
        System.Data.Common.DbCommand command,
        string name,
        object value)
    {
        var parameter = command.CreateParameter();
        parameter.ParameterName = name;
        parameter.Value = value;
        command.Parameters.Add(parameter);
    }
}
