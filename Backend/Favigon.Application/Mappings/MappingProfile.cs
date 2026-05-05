using AutoMapper;
using Favigon.Application.DTOs.Requests;
using Favigon.Application.DTOs.Responses;
using Favigon.Domain.Entities;

namespace Favigon.Application.Mappings;

public class MappingProfile : Profile
{
  public MappingProfile()
  {
    CreateMap<Project, ProjectResponse>()
      .ForMember(dest => dest.ProjectId, opt => opt.MapFrom(src => src.Id))
      .ForMember(dest => dest.Slug, opt => opt.MapFrom(src => src.Slug))
      .ForMember(dest => dest.StarCount, opt => opt.MapFrom(src => src.Bookmarks.Count))
      .ForMember(dest => dest.LikeCount, opt => opt.MapFrom(src => src.Likes.Count))
      .ForMember(dest => dest.IsStarredByCurrentUser, opt => opt.Ignore())
      .ForMember(dest => dest.IsLikedByCurrentUser, opt => opt.Ignore());

    CreateMap<ProjectCreateRequest, Project>()
      .ForMember(dest => dest.Id, opt => opt.Ignore())
      .ForMember(dest => dest.User, opt => opt.Ignore())
      .ForMember(dest => dest.Bookmarks, opt => opt.Ignore())
      .ForMember(dest => dest.Likes, opt => opt.Ignore())
      .ForMember(dest => dest.CreatedAt, opt => opt.Ignore())
      .ForMember(dest => dest.UpdatedAt, opt => opt.Ignore());

    CreateMap<ProjectUpdateRequest, Project>()
      .ForMember(dest => dest.Id, opt => opt.Ignore())
      .ForMember(dest => dest.UserId, opt => opt.Ignore())
      .ForMember(dest => dest.User, opt => opt.Ignore())
      .ForMember(dest => dest.Bookmarks, opt => opt.Ignore())
      .ForMember(dest => dest.Likes, opt => opt.Ignore())
      .ForMember(dest => dest.CreatedAt, opt => opt.Ignore());

    CreateMap<User, UserResponse>()
      .ForMember(dest => dest.UserId, opt => opt.MapFrom(src => src.Id))
      .ForMember(dest => dest.LinkedAccounts, opt => opt.Ignore());

    CreateMap<LinkedAccount, LinkedAccountResponse>();

    CreateMap<User, AuthResponse>()
      .ForMember(dest => dest.UserId, opt => opt.MapFrom(src => src.Id))
      .ForMember(dest => dest.Token, opt => opt.Ignore())
      .ForMember(dest => dest.ExpiresAt, opt => opt.Ignore());

    CreateMap<UserCreateRequest, User>()
      .ForMember(dest => dest.Id, opt => opt.Ignore())
      .ForMember(dest => dest.PasswordHash, opt => opt.Ignore())
      .ForMember(dest => dest.CreatedAt, opt => opt.Ignore())
      .ForMember(dest => dest.Projects, opt => opt.Ignore())
      .ForMember(dest => dest.Followers, opt => opt.Ignore())
      .ForMember(dest => dest.Following, opt => opt.Ignore())
      .ForMember(dest => dest.Bookmarks, opt => opt.Ignore());

    CreateMap<UserUpdateRequest, User>()
      .ForMember(dest => dest.Id, opt => opt.Ignore())
      .ForMember(dest => dest.PasswordHash, opt => opt.Ignore())
      .ForMember(dest => dest.CreatedAt, opt => opt.Ignore())
      .ForMember(dest => dest.Projects, opt => opt.Ignore())
      .ForMember(dest => dest.Followers, opt => opt.Ignore())
      .ForMember(dest => dest.Following, opt => opt.Ignore())
      .ForMember(dest => dest.Bookmarks, opt => opt.Ignore());

    CreateMap<RegisterRequest, User>()
      .ForMember(dest => dest.Id, opt => opt.Ignore())
      .ForMember(dest => dest.PasswordHash, opt => opt.Ignore())
      .ForMember(dest => dest.CreatedAt, opt => opt.Ignore())
      .ForMember(dest => dest.Projects, opt => opt.Ignore())
      .ForMember(dest => dest.Followers, opt => opt.Ignore())
      .ForMember(dest => dest.Following, opt => opt.Ignore())
      .ForMember(dest => dest.Bookmarks, opt => opt.Ignore());
  }
}
