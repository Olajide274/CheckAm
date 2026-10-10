using System.ComponentModel.DataAnnotations;
using System.Text.RegularExpressions;

namespace CheckAm.Application.Auth;

public static class PhoneNumberNormalizer
{
    public static string NormalizeNigerianPhoneNumber(string? input)
    {
        if (string.IsNullOrWhiteSpace(input))
        {
            throw new ValidationException("Enter a Nigerian phone number.");
        }

        var value = input.Trim();
        if (!Regex.IsMatch(value, @"^\+?[0-9\s().-]+$", RegexOptions.CultureInvariant))
        {
            throw new ValidationException("Enter a valid Nigerian mobile number.");
        }

        var hasInternationalPrefix = value.StartsWith('+');
        var digits = new string(value.Where(char.IsAsciiDigit).ToArray());

        if (digits.Length == 11 && digits.StartsWith("0", StringComparison.Ordinal))
        {
            digits = $"234{digits[1..]}";
        }
        else if (digits.Length == 10 && !hasInternationalPrefix)
        {
            digits = $"234{digits}";
        }

        if (!digits.StartsWith("234", StringComparison.Ordinal)
            || digits.Length != 13
            || digits[3] is < '7' or > '9')
        {
            throw new ValidationException("Enter a valid Nigerian mobile number.");
        }

        return $"+{digits}";
    }
}
