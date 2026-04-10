using System.Text;
using Favigon.Converter.Models;
using Favigon.Converter.Transformers;

namespace Favigon.Converter.Transformers;

public sealed class StyleBuilder
{
  private readonly List<(string CssClass, Dictionary<string, string> Props)> _baseRules = [];
  private readonly List<string> _mediaRules = [];

  public void AddBase(string cssClass, Dictionary<string, string> props)
  {
    if (props.Count > 0)
      _baseRules.Add((cssClass, props));
  }

  public void AddVariants(string cssClass, Dictionary<string, IRVariant> variants)
  {
    if (variants.Count == 0) return;
    var media = ResponsiveTransformer.ToCssMediaQueries(variants, $".{cssClass}");
    if (!string.IsNullOrWhiteSpace(media))
      _mediaRules.Add(media);
  }

  public bool IsEmpty => _baseRules.Count == 0 && _mediaRules.Count == 0;

  /// <summary>Returns a snapshot of all base rules as {className: {prop: value}} for diff computation.</summary>
  public IReadOnlyDictionary<string, IReadOnlyDictionary<string, string>> GetBaseRulesSnapshot()
  {
    var map = new Dictionary<string, IReadOnlyDictionary<string, string>>(StringComparer.Ordinal);
    foreach (var (cssClass, props) in _baseRules)
      map[cssClass] = props;
    return map;
  }

  public string Build()
  {
    if (IsEmpty) return string.Empty;

    var sb = new StringBuilder();

    foreach (var (cssClass, props) in _baseRules)
    {
      sb.Append($".{cssClass} {{\n");
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
