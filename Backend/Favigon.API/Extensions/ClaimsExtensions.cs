using System.Security.Claims;

namespace Favigon.API.Extensions;

public static class ClaimsExtensions
{
  public static bool TryGetUserId(this ClaimsPrincipal user, out int userId)
  {
    var idStr = user.FindFirstValue(ClaimTypes.NameIdentifier);
    return int.TryParse(idStr, out userId);
  }
}
