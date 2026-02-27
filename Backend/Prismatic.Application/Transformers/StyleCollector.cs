using System.Text;
using Prismatic.Domain.IR;

namespace Prismatic.Application.Transformers;

/// <summary>
/// Shared mutable collector passed through the entire generator tree.
/// Each mapper deposits its CSS here; the pipeline extracts it at the end.
/// Must be a reference type so all EmitContext copies share the same instance.
/// </summary>
public sealed class StyleCollector
{
  private readonly List<(string NodeId, Dictionary<string, string> Props)> _baseRules = [];
  private readonly List<string> _mediaRules = [];

  /// <summary>Deposits base CSS properties for a node class.</summary>
  public void AddBase(string nodeId, Dictionary<string, string> props)
  {
    if (props.Count > 0)
      _baseRules.Add((nodeId, props));
  }

  /// <summary>Deposits responsive @media overrides for a node class.</summary>
  public void AddResponsive(string nodeId, Dictionary<string, IRResponsiveOverride> responsive)
  {
    if (responsive.Count == 0) return;
    var media = ResponsiveTransformer.ToCssMediaQueries(responsive, $".prismatic-{nodeId}");
    if (!string.IsNullOrWhiteSpace(media))
      _mediaRules.Add(media);
  }

  public bool IsEmpty => _baseRules.Count == 0 && _mediaRules.Count == 0;

  /// <summary>Builds the full CSS string: base rules first, then @media blocks.</summary>
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
