using Favigon.Domain.Entities;

namespace Favigon.Application.Interfaces;

public interface ILinkedAccountRepository
{
  Task<LinkedAccount?> GetByProviderAsync(string provider, string providerUserId);
  Task<IReadOnlyList<LinkedAccount>> GetByUserIdAsync(int userId);
  Task<LinkedAccount?> GetByUserIdAndProviderAsync(int userId, string provider);
  Task<LinkedAccount> AddAsync(LinkedAccount linkedAccount);
  Task UpdateAsync(LinkedAccount linkedAccount);
  Task RemoveAsync(LinkedAccount linkedAccount);
}