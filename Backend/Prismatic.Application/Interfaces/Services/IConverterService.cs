using Prismatic.Domain.IR;
using Prismatic.Application.DTOs.Responses;

namespace Prismatic.Application.Interfaces;

public interface IConverterService
{
  ConverterResponse Generate(IRNode root, string framework, string? flavor = null);
  IRValidationResult Validate(IRNode root);
}
