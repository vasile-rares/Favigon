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
    };

    message.To.Add(toEmail);

    if (!string.IsNullOrWhiteSpace(textBody))
    {
      message.AlternateViews.Add(AlternateView.CreateAlternateViewFromString(textBody, null, "text/plain"));
    }

    message.AlternateViews.Add(AlternateView.CreateAlternateViewFromString(htmlBody, null, "text/html"));

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

  public Task SendPasswordResetEmailAsync(string toEmail, string resetUrl, int tokenLifetimeMinutes)
  {
    var encodedUrl = WebUtility.HtmlEncode(resetUrl);

    var htmlBody = $$"""
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Reset your password</title>
</head>
<body style="margin:0;padding:0;background-color:#ffffff;font-family:'Inter',ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:#475569;-webkit-font-smoothing:antialiased;">
  <div style="width:100%;background-color:#ffffff;padding:48px 24px;box-sizing:border-box;">
    <div style="max-width:512px;margin:0 auto;background-color:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px 0 rgba(0,0,0,0.1),0 1px 2px -1px rgba(0,0,0,0.1);">

      <div style="padding:32px 32px 0 32px;margin-bottom:24px;">
        <div style="font-size:24px;font-weight:600;letter-spacing:-0.5px;color:#171717;">
          Prismatic<span style="color:#0d99ff;">.</span>
        </div>
      </div>

      <div style="padding:0 32px 32px 32px;background-color:#ffffff;">
        <h1 style="font-size:18px;font-weight:600;color:#171717;margin:0 0 8px;">Reset your password</h1>
        <p style="font-size:14px;line-height:1.6;color:#475569;margin:0 0 24px;">
          We received a request to reset the password for your Prismatic account.
          Click the button below to choose a new password.
        </p>
        <div style="margin-bottom:24px;">
          <a href="{{encodedUrl}}" style="display:inline-block;background-color:#171717;color:#ffffff;text-decoration:none;font-size:14px;font-weight:500;padding:8px 16px;border-radius:6px;">Reset Password</a>
        </div>
        <p style="font-size:14px;line-height:1.6;color:#475569;margin:0;">
          This link will expire in <span style="color:#171717;font-weight:600;">{{tokenLifetimeMinutes}} minutes</span>.
          If you did not request this, you can safely ignore this email.
        </p>
      </div>

      <div style="background-color:#f8fafc;border-top:1px solid #e2e8f0;padding:24px 32px;">
        <p style="font-size:12px;color:#64748b;margin:0 0 4px;">If the button doesn't work, copy this URL into your browser:</p>
        <a href="{{encodedUrl}}" style="font-size:12px;color:#3b82f6;word-break:break-all;text-decoration:underline;">{{encodedUrl}}</a>
      </div>

    </div>
    <div style="text-align:center;margin-top:24px;">
      <p style="font-size:12px;color:#94a3b8;margin:0;">&copy; {{DateTime.UtcNow.Year}} Prismatic. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
""";

    var textBody =
      "Reset your Prismatic password" + Environment.NewLine +
      Environment.NewLine +
      "We received a request to reset the password for your Prismatic account." + Environment.NewLine +
      $"Click this link to reset your password (expires in {tokenLifetimeMinutes} minutes):" + Environment.NewLine +
      resetUrl + Environment.NewLine +
      Environment.NewLine +
      "If you did not request this, you can safely ignore this email.";

    return SendEmailAsync(toEmail, "Reset your Prismatic password", htmlBody, textBody);
  }
}
