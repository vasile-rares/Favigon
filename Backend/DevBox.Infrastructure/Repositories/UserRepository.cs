using DevBox.Application.Interfaces;
using DevBox.Domain.Entities;
using AppDbContext = DevBox.Infrastructure.Context.DbContext;
using Microsoft.EntityFrameworkCore;

namespace DevBox.Infrastructure.Repositories;

public class UserRepository : IUserRepository
{
  private readonly AppDbContext _context;

  public UserRepository(AppDbContext context)
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
