using CheckAm.Domain.Auth;
using Microsoft.EntityFrameworkCore;

namespace CheckAm.Infrastructure.Persistence;

public sealed class CheckAmDbContext(DbContextOptions<CheckAmDbContext> options) : DbContext(options)
{
    public DbSet<OtpChallenge> OtpChallenges => Set<OtpChallenge>();
    public DbSet<OtpRateLimitBucket> OtpRateLimitBuckets => Set<OtpRateLimitBucket>();
    public DbSet<UserSession> UserSessions => Set<UserSession>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<OtpChallenge>(entity =>
        {
            entity.HasKey(challenge => challenge.Id);
            entity.Property(challenge => challenge.PhoneKey).HasMaxLength(64);
            entity.Property(challenge => challenge.CodeHash).HasMaxLength(64);
            entity.HasIndex(challenge => new { challenge.PhoneKey, challenge.CreatedAt });
        });

        modelBuilder.Entity<UserSession>(entity =>
        {
            entity.HasKey(session => session.Id);
            entity.Property(session => session.TokenHash).HasMaxLength(64);
            entity.HasIndex(session => session.TokenHash).IsUnique();
        });

        modelBuilder.Entity<OtpRateLimitBucket>(entity =>
        {
            entity.HasKey(bucket => bucket.Key);
            entity.Property(bucket => bucket.Key).HasMaxLength(64);
            entity.HasIndex(bucket => bucket.WindowStartedAt);
        });
    }
}
