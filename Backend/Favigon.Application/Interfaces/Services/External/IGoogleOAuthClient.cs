using Favigon.Application.DTOs.Responses;

namespace Favigon.Application.Interfaces;

public interface IGoogleOAuthClient
{
  Task<GoogleOAuthProfile> GetUserProfileAsync(string code);
}
