using Favigon.Application.DTOs.Responses;
using Favigon.Converter.Abstractions;
using Favigon.Converter.Models;

namespace Favigon.Application.Interfaces;

public interface IConverterService
{
  ConverterResponse Generate(IRNode root, string framework);
  bool Validate(IRNode root);
}
