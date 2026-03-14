using System.Text;
using Favigon.Converter.Models;
using Favigon.Converter.Transformers;

namespace Favigon.Converter.Transformers;

public sealed class StyleBuilder
{
  private readonly List<(string NodeId, Dictionary<string, string> Props)> _baseRules = [];
  private readonly List<string> _mediaRules = [];

  public void AddBase(string nodeId, Dictionary<string, string> props)
  {
    if (props.Count > 0)
      _baseRules.Add((nodeId, props));
  }

  public void AddVariants(string nodeId, Dictionary<string, IRVariant> variants)
  {
    if (variants.Count == 0) return;
    var media = ResponsiveTransformer.ToCssMediaQueries(variants, $".favigon-{nodeId}");
    if (!string.IsNullOrWhiteSpace(media))
      _mediaRules.Add(media);
  }

  public bool IsEmpty => _baseRules.Count == 0 && _mediaRules.Count == 0;

  public string Build()
  {
    if (IsEmpty) return string.Empty;

    var sb = new StringBuilder();

    foreach (var (nodeId, props) in _baseRules)
    {
      sb.Append($".favigon-{nodeId} {{\n");
      foreach (var (k, v) in props)
        sb.Append($"  {k}: {v};\n");
      sb.Append("}\n");
    }

    if (_mediaRules.Count > 0)
    {
      sb.Append('\n');
      foreach (var media in _mediaRules)
        sb.Append(media);
    }

    return sb.ToString();
  }
}
