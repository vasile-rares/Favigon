using Microsoft.EntityFrameworkCore;
using Prismatic.Application.Interfaces;
using Prismatic.Domain.Entities;
using Prismatic.Infrastructure.Context;

namespace Prismatic.Infrastructure.Repositories;

public class AccountProviderRepository : IAccountProviderRepository
{
  private readonly PrismaticDbContext _context;

  public AccountProviderRepository(PrismaticDbContext context)
  {
    _context = context;
  }

  public Task<AccountProvider?> GetByProviderAsync(string provider, string providerUserId)
  {
    return _context.AccountProviders
      .Include(accountProvider => accountProvider.User)
      .FirstOrDefaultAsync(accountProvider =>
        accountProvider.Provider == provider && accountProvider.ProviderUserId == providerUserId);
  }

  public Task<AccountProvider?> GetByUserIdAndProviderAsync(int userId, string provider)
  {
    return _context.AccountProviders.FirstOrDefaultAsync(accountProvider =>
      accountProvider.UserId == userId && accountProvider.Provider == provider);
  }

  public async Task<AccountProvider> AddAsync(AccountProvider accountProvider)
  {
    _context.AccountProviders.Add(accountProvider);
    await _context.SaveChangesAsync();
    return accountProvider;
  }

  public async Task UpdateAsync(AccountProvider accountProvider)
  {
    _context.AccountProviders.Update(accountProvider);
    await _context.SaveChangesAsync();
  }
}