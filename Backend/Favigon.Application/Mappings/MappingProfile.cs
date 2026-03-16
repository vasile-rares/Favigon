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
      .ForMember(dest => dest.ProjectId, opt => opt.MapFrom(src => src.Id));

    CreateMap<ProjectCreateRequest, Project>()
      .ForMember(dest => dest.Id, opt => opt.Ignore())
      .ForMember(dest => dest.User, opt => opt.Ignore())
      .ForMember(dest => dest.CreatedAt, opt => opt.Ignore())
      .ForMember(dest => dest.UpdatedAt, opt => opt.Ignore());

    CreateMap<ProjectUpdateRequest, Project>()
      .ForMember(dest => dest.Id, opt => opt.Ignore())
      .ForMember(dest => dest.UserId, opt => opt.Ignore())
      .ForMember(dest => dest.User, opt => opt.Ignore())
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
      .ForMember(dest => dest.Projects, opt => opt.Ignore());

    CreateMap<UserUpdateRequest, User>()
      .ForMember(dest => dest.Id, opt => opt.Ignore())
      .ForMember(dest => dest.PasswordHash, opt => opt.Ignore())
      .ForMember(dest => dest.CreatedAt, opt => opt.Ignore())
      .ForMember(dest => dest.Projects, opt => opt.Ignore());

    CreateMap<RegisterRequest, User>()
      .ForMember(dest => dest.Id, opt => opt.Ignore())
      .ForMember(dest => dest.PasswordHash, opt => opt.Ignore())
      .ForMember(dest => dest.CreatedAt, opt => opt.Ignore())
      .ForMember(dest => dest.Projects, opt => opt.Ignore());
  }
}
