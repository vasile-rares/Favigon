using Prismatic.Application.DTOs.Responses;
using Prismatic.Converter.Abstractions;
using Prismatic.Converter.Models;

namespace Prismatic.Application.Interfaces;

public interface IConverterService
{
  ConverterResponse Generate(IRNode root, string framework);
  bool Validate(IRNode root);
}
