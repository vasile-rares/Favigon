using System.Text;

namespace Favigon.Converter.Transformers;

public sealed class StyleBuilder
{
  private readonly List<(string CssClass, Dictionary<string, string> Props)> _baseRules = [];
  private readonly List<(string Selector, Dictionary<string, string> Props)> _pseudoRules = [];
  private readonly List<(string Name, string Body)> _keyframeRules = [];

  public void AddBase(string cssClass, Dictionary<string, string> props)
  {
    if (props.Count > 0)
      _baseRules.Add((cssClass, props));
  }

  public void AddPseudo(string cssClass, string pseudoClass, Dictionary<string, string> props)
  {
    if (props.Count > 0)
      _pseudoRules.Add(($".{cssClass}:{pseudoClass}", props));
  }

  public void AddRule(string fullSelector, Dictionary<string, string> props)
  {
    if (props.Count > 0)
      _pseudoRules.Add((fullSelector, props));
  }

  public void AddKeyframes(string name, string body)
  {
    if (!_keyframeRules.Exists(k => k.Name == name))
      _keyframeRules.Add((name, body));
  }

  public bool IsEmpty => _baseRules.Count == 0 && _pseudoRules.Count == 0 && _keyframeRules.Count == 0;

  public IReadOnlyDictionary<string, IReadOnlyDictionary<string, string>> GetBaseRulesSnapshot()
  {
    var map = new Dictionary<string, IReadOnlyDictionary<string, string>>(StringComparer.Ordinal);
    foreach (var (cssClass, props) in _baseRules)
      map[cssClass] = props;
    return map;
  }

  public IReadOnlyList<(string Selector, IReadOnlyDictionary<string, string> Props)> GetPseudoRulesSnapshot() =>
    _pseudoRules.Select(r => (r.Selector, (IReadOnlyDictionary<string, string>)r.Props)).ToList();

  public IReadOnlyList<(string Name, string Body)> GetKeyframesSnapshot() =>
    [.. _keyframeRules];

  public string Build()
  {
    if (IsEmpty) return string.Empty;

    var sb = new StringBuilder();

    foreach (var (name, body) in _keyframeRules)
    {
      sb.Append($"@keyframes {name} {{\n{body}}}\n");
    }

    if (_keyframeRules.Count > 0)
      sb.Append('\n');

    foreach (var (cssClass, props) in _baseRules)
    {
      sb.Append($".{cssClass} {{\n");
      foreach (var (k, v) in props)
        sb.Append($"  {k}: {v};\n");
      sb.Append("}\n");
    }

    foreach (var (selector, props) in _pseudoRules)
    {
      sb.Append($"{selector} {{\n");
      foreach (var (k, v) in props)
        sb.Append($"  {k}: {v};\n");
      sb.Append("}\n");
    }

    return sb.ToString();
  }
}
