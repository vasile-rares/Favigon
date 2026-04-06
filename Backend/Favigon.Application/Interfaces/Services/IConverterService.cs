using Favigon.Application.DTOs.Requests;
using Favigon.Application.DTOs.Responses;
using Favigon.Converter.Models;

namespace Favigon.Application.Interfaces;

public interface IConverterService
{
  ConverterResponse Generate(IRNode root, string framework);
  ConverterResponse GenerateResponsive(List<ConverterPageInput> pages, string framework);
  bool Validate(IRNode root);
}
