using Favigon.Application.DTOs.Responses;

namespace Favigon.Application.Interfaces;

public interface IGithubOAuthClient
{
  Task<GithubOAuthProfile> GetUserProfileAsync(string code);
}
