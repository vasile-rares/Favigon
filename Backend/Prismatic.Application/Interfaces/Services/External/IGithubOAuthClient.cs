using Prismatic.Application.DTOs.Responses;

namespace Prismatic.Application.Interfaces;

public interface IGithubOAuthClient
{
  Task<GithubOAuthProfile> GetUserProfileAsync(string code);
}
