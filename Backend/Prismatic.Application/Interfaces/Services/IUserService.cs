using Prismatic.Application.DTOs.Requests;
using Prismatic.Domain.Entities;

namespace Prismatic.Application.Interfaces;

public interface IUserService
{
  Task<IReadOnlyList<User>> GetAllAsync();
  Task<User?> GetByIdAsync(int id);
  Task<User?> GetByUsernameAsync(string username);
  Task<IReadOnlyList<User>> SearchAsync(string query);
  Task<User> CreateAsync(UserCreateRequest request);
  Task<User?> UpdateAsync(int id, UserUpdateRequest request);
  Task<bool> DeleteAsync(int id);
}
