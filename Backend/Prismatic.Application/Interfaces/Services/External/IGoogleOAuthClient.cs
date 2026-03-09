using Prismatic.Application.DTOs.Responses;

namespace Prismatic.Application.Interfaces;

public interface IGoogleOAuthClient
{
  Task<GoogleOAuthProfile> GetUserProfileAsync(string code);
}
