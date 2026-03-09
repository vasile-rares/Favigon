using Microsoft.EntityFrameworkCore;
using Prismatic.Application.Interfaces;
using Prismatic.Domain.Entities;
using Prismatic.Infrastructure.Context;

namespace Prismatic.Infrastructure.Repositories;

public class LinkedAccountRepository : ILinkedAccountRepository
{
  private readonly PrismaticDbContext _context;

  public LinkedAccountRepository(PrismaticDbContext context)
  {
    _context = context;
  }

  public Task<LinkedAccount?> GetByProviderAsync(string provider, string providerUserId)
  {
    return _context.LinkedAccounts
      .Include(la => la.User)
      .FirstOrDefaultAsync(la =>
        la.Provider == provider && la.ProviderUserId == providerUserId);
  }

  public async Task<LinkedAccount> AddAsync(LinkedAccount linkedAccount)
  {
    _context.LinkedAccounts.Add(linkedAccount);
    await _context.SaveChangesAsync();
    return linkedAccount;
  }

  public async Task UpdateAsync(LinkedAccount linkedAccount)
  {
    _context.LinkedAccounts.Update(linkedAccount);
    await _context.SaveChangesAsync();
  }
}