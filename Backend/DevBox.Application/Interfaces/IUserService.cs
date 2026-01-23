using DevBox.Domain.Entities;

namespace DevBox.Application.Interfaces;

public interface IUserService
{
  Task<IReadOnlyList<User>> GetAllAsync();
  Task<User?> GetByIdAsync(int id);
  Task<User> CreateAsync(User user);
  Task<User?> UpdateAsync(int id, User updated);
  Task<bool> DeleteAsync(int id);
}
