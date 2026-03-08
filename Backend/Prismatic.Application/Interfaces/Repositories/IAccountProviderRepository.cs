using Prismatic.Domain.Entities;

namespace Prismatic.Application.Interfaces;

public interface IAccountProviderRepository
{
  Task<AccountProvider?> GetByProviderAsync(string provider, string providerUserId);
  Task<AccountProvider?> GetByUserIdAndProviderAsync(int userId, string provider);
  Task<AccountProvider> AddAsync(AccountProvider accountProvider);
  Task UpdateAsync(AccountProvider accountProvider);
}