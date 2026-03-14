using Favigon.Application.Interfaces;
using Favigon.Domain.Entities;
using Favigon.Infrastructure.Context;
using Microsoft.EntityFrameworkCore;

namespace Favigon.Infrastructure.Repositories;

public class UserRepository : IUserRepository
{
  private readonly FavigonDbContext _context;

  public UserRepository(FavigonDbContext context)
  {
    _context = context;
  }

  public async Task<IReadOnlyList<User>> GetAllAsync()
  {
    return await _context.Users.AsNoTracking().ToListAsync();
  }

  public Task<User?> GetByIdAsync(int id)
  {
    return _context.Users.FirstOrDefaultAsync(u => u.Id == id);
  }

  public Task<User?> GetByUsernameAsync(string username)
  {
    return _context.Users.FirstOrDefaultAsync(u => u.Username == username);
  }

  public Task<User?> GetByEmailAsync(string email)
  {
    return _context.Users.FirstOrDefaultAsync(u => u.Email == email);
  }

  public Task<User?> GetByPasswordResetTokenHashAsync(string tokenHash)
  {
    return _context.Users.FirstOrDefaultAsync(u => u.PasswordResetTokenHash == tokenHash);
  }

  public async Task<IReadOnlyList<User>> SearchByQueryAsync(string query, int limit)
  {
    return await _context.Users
        .AsNoTracking()
        .Where(u => EF.Functions.ILike(u.Username, $"%{query}%") ||
                    EF.Functions.ILike(u.DisplayName, $"%{query}%"))
        .Take(limit)
        .ToListAsync();
  }

  public async Task<User> AddAsync(User user)
  {
    _context.Users.Add(user);
    await _context.SaveChangesAsync();
    return user;
  }

  public async Task UpdateAsync(User user)
  {
    _context.Users.Update(user);
    await _context.SaveChangesAsync();
  }

  public async Task DeleteAsync(User user)
  {
    _context.Users.Remove(user);
    await _context.SaveChangesAsync();
  }
}
