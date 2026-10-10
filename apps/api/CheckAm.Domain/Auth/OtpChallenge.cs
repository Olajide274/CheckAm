namespace CheckAm.Domain.Auth;

public sealed class OtpChallenge
{
    public Guid Id { get; set; }
    public required string PhoneKey { get; set; }
    public required string CodeHash { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset ExpiresAt { get; set; }
    public DateTimeOffset? ConsumedAt { get; set; }
    public int FailedAttempts { get; set; }
}
