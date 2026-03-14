using Favigon.Converter.Models;

namespace Favigon.Converter.Abstractions;

public interface IConverterEngine
{
  (string Html, string Css) GenerateFromCanvas(string canvasJson, string framework);
  (string Html, string Css) Generate(IRNode root, string framework);
  bool Validate(IRNode root);
  IRNode ParseCanvas(string canvasJson);
}
