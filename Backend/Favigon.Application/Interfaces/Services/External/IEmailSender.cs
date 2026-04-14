namespace Favigon.Application.Interfaces;

public interface IEmailSender
{
  Task SendEmailAsync(string toEmail, string subject, string htmlBody, string? textBody = null);
  Task SendPasswordResetEmailAsync(string toEmail, string resetUrl, int tokenLifetimeMinutes);
  Task SendPasswordSetConfirmationEmailAsync(string toEmail);
  Task SendTwoFactorCodeEmailAsync(string toEmail, string code, string purpose, int expirationMinutes);
}
