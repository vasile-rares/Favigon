using Microsoft.EntityFrameworkCore;
using Favigon.Application.Interfaces;
using Favigon.Domain.Entities;
using Favigon.Infrastructure.Context;

namespace Favigon.Infrastructure.Repositories;

public class LinkedAccountRepository : ILinkedAccountRepository
{
  private readonly FavigonDbContext _context;

  public LinkedAccountRepository(FavigonDbContext context)
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

  public async Task<IReadOnlyList<LinkedAccount>> GetByUserIdAsync(int userId)
  {
    return await _context.LinkedAccounts
      .Where(la => la.UserId == userId)
      .ToListAsync();
  }

  public Task<LinkedAccount?> GetByUserIdAndProviderAsync(int userId, string provider)
  {
    return _context.LinkedAccounts
      .FirstOrDefaultAsync(la => la.UserId == userId && la.Provider == provider);
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

  public async Task RemoveAsync(LinkedAccount linkedAccount)
  {
    _context.LinkedAccounts.Remove(linkedAccount);
    await _context.SaveChangesAsync();
  }
}