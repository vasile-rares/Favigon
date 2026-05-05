namespace Favigon.Application.Interfaces;

public interface ILikeService
{
  Task LikeAsync(int userId, int projectId);
  Task UnlikeAsync(int userId, int projectId);
}
