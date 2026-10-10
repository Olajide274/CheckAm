namespace CheckAm.Domain.Auth;

public sealed class OtpRateLimitBucket
{
    public required string Key { get; set; }
    public DateTimeOffset WindowStartedAt { get; set; }
    public int Count { get; set; }
}
