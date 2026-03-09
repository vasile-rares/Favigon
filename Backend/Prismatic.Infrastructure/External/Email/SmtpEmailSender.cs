using System.Net;
using System.Net.Mail;
using Microsoft.Extensions.Configuration;
using Prismatic.Application.Interfaces;

namespace Prismatic.Infrastructure.External.Email;

public class SmtpEmailSender : IEmailSender
{
  private readonly IConfiguration _configuration;

  public SmtpEmailSender(IConfiguration configuration)
  {
    _configuration = configuration;
  }

  public async Task SendEmailAsync(string toEmail, string subject, string htmlBody, string? textBody = null)
  {
    var smtpHost = _configuration["Email:SmtpHost"];
    var fromEmail = _configuration["Email:FromEmail"];

    if (string.IsNullOrWhiteSpace(smtpHost) || string.IsNullOrWhiteSpace(fromEmail))
    {
      throw new InvalidOperationException("Email sending is not configured on the server.");
    }

    var fromName = _configuration["Email:FromName"];
    var smtpPort = _configuration.GetValue<int?>("Email:SmtpPort") ?? 587;
    var enableSsl = _configuration.GetValue<bool?>("Email:EnableSsl") ?? true;
    var username = _configuration["Email:SmtpUsername"];
    var password = _configuration["Email:SmtpPassword"];

    using var message = new MailMessage
    {
      From = string.IsNullOrWhiteSpace(fromName)
        ? new MailAddress(fromEmail)
        : new MailAddress(fromEmail, fromName),
      Subject = subject,
      Body = htmlBody,
      IsBodyHtml = true,
    };

    message.To.Add(toEmail);

    if (!string.IsNullOrWhiteSpace(textBody))
    {
      message.AlternateViews.Add(AlternateView.CreateAlternateViewFromString(textBody, null, "text/plain"));
    }

    using var client = new SmtpClient(smtpHost, smtpPort)
    {
      EnableSsl = enableSsl,
      DeliveryMethod = SmtpDeliveryMethod.Network,
    };

    if (!string.IsNullOrWhiteSpace(username))
    {
      client.Credentials = new NetworkCredential(username, password);
    }

    await client.SendMailAsync(message);
  }
}
