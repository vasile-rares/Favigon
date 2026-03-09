using Prismatic.Domain.Entities;

namespace Prismatic.Application.Interfaces;

public interface ILinkedAccountRepository
{
  Task<LinkedAccount?> GetByProviderAsync(string provider, string providerUserId);
  Task<LinkedAccount> AddAsync(LinkedAccount linkedAccount);
  Task UpdateAsync(LinkedAccount linkedAccount);
}