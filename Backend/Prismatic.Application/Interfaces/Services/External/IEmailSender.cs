namespace Prismatic.Application.Interfaces;

public interface IEmailSender
{
  Task SendEmailAsync(string toEmail, string subject, string htmlBody, string? textBody = null);
}
