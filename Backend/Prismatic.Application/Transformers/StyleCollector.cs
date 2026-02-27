using System.Text;
using Prismatic.Domain.IR;

namespace Prismatic.Application.Transformers;

public sealed class StyleCollector
{
  private readonly List<(string NodeId, Dictionary<string, string> Props)> _baseRules = [];
  private readonly List<string> _mediaRules = [];

  public void AddBase(string nodeId, Dictionary<string, string> props)
  {
    if (props.Count > 0)
      _baseRules.Add((nodeId, props));
  }

  public void AddResponsive(string nodeId, Dictionary<string, IRResponsiveOverride> responsive)
  {
    if (responsive.Count == 0) return;
    var media = ResponsiveTransformer.ToCssMediaQueries(responsive, $".prismatic-{nodeId}");
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
      sb.Append($".prismatic-{nodeId} {{\n");
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
