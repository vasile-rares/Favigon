using Prismatic.Domain.Entities;

namespace Prismatic.Application.Interfaces;

public interface IUserRepository
{
  Task<IReadOnlyList<User>> GetAllAsync();
  Task<User?> GetByIdAsync(int id);
  Task<User?> GetByUsernameAsync(string username);
  Task<User?> GetByEmailAsync(string email);
  Task<User?> GetByPasswordResetTokenHashAsync(string tokenHash);
  Task<IReadOnlyList<User>> SearchByQueryAsync(string query, int limit);
  Task<User> AddAsync(User user);
  Task UpdateAsync(User user);
  Task DeleteAsync(User user);
}
