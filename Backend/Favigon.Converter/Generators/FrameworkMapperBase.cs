using System.Text;
using System.Text.Json;
using Favigon.Converter.Abstractions;
using Favigon.Converter.Models;
using Favigon.Converter.Transformers;
using Favigon.Converter.Utils;

namespace Favigon.Converter.Generators;

public abstract class FrameworkMapperBase : IComponentMapper
{
  private static readonly AsyncLocal<EmitContext?> CurrentContext = new();

  public abstract string Type { get; }

  protected abstract string ClassAttributeName { get; }
  protected abstract string OpenNodeComment(IRNode node, EmitContext ctx);
  protected abstract string CloseNodeComment(IRNode node, EmitContext ctx);

  public string Emit(IRNode node, EmitContext ctx)
  {
    var cssClasses = ctx.GetCssClasses(node);
    var cssProps = StyleTransformer.MergeToProperties(node.Layout, node.Style, node.Position);
    if (node.Meta.Hidden)
      cssProps["display"] = "none";
    if (node.Effects is { Count: > 0 } effectsList)
    {
      var statePseudoProps = new Dictionary<string, Dictionary<string, string>>(StringComparer.OrdinalIgnoreCase);
      var stateTransforms = new Dictionary<string, List<string>>(StringComparer.OrdinalIgnoreCase);
      var stateTransitionSources = new Dictionary<string, IREffect>(StringComparer.OrdinalIgnoreCase);

      // Group effects by trigger so multiple animations on the same pseudo-class are combined
      var byTrigger = new Dictionary<string, List<string>>(StringComparer.OrdinalIgnoreCase);

      foreach (var effect in effectsList)
      {
        var trigger = effect.Trigger ?? "onLoad";
        if (TryResolveStatePseudoClass(trigger, out var statePseudoClass))
        {
          stateTransitionSources[statePseudoClass] = effect;

          if (!statePseudoProps.TryGetValue(statePseudoClass, out var pseudoProps))
            statePseudoProps[statePseudoClass] = pseudoProps = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

          if (TryBuildStateTransform(effect, out var stateEffectTransform))
          {
            if (!stateTransforms.TryGetValue(statePseudoClass, out var transforms))
              stateTransforms[statePseudoClass] = transforms = [];
            transforms.Add(stateEffectTransform);
          }

          if (effect.Opacity is double opacity && Math.Abs(opacity - 1d) > 0.0001d)
            pseudoProps["opacity"] = opacity.ToString("0.###", System.Globalization.CultureInfo.InvariantCulture);

          if (!string.IsNullOrWhiteSpace(effect.Fill))
            pseudoProps["background"] = effect.Fill;

          if (!string.IsNullOrWhiteSpace(effect.Shadow))
            pseudoProps["box-shadow"] = effect.Shadow;

          continue;
        }

        if (!AnimationPresets.TryBuild(effect, out var keyframeName, out var keyframeBody))
          continue;

        ctx.Styles.AddKeyframes(keyframeName, keyframeBody);

        var iterations = trigger == "loop" ? "infinite" : effect.Iterations;
        var animationDuration = AnimationPresets.GetAnimationDuration(effect);
        var animationDelay = AnimationPresets.GetAnimationDelay(effect);
        var animationDirection = AnimationPresets.GetAnimationDirection(effect);
        var animValue = $"{keyframeName} {animationDuration}ms {effect.Easing} {animationDelay} {iterations} {animationDirection} {effect.FillMode}";

        if (!byTrigger.TryGetValue(trigger, out var list))
          byTrigger[trigger] = list = [];
        list.Add(animValue);
      }

      foreach (var (pseudoClass, pseudoProps) in statePseudoProps)
      {
        if (stateTransforms.TryGetValue(pseudoClass, out var transforms) && transforms.Count > 0)
        {
          var stateTransform = string.Join(' ', transforms);
          pseudoProps["transform"] = cssProps.TryGetValue("transform", out var baseTransform) && !string.IsNullOrWhiteSpace(baseTransform)
            ? $"{baseTransform} {stateTransform}".Trim()
            : stateTransform;
        }

        if (pseudoProps.Count == 0)
          continue;

        ctx.Styles.AddPseudo(cssClasses.TargetClass, pseudoClass, pseudoProps);

        if (stateTransitionSources.TryGetValue(pseudoClass, out var transitionSource))
        {
          var transitionDelay = transitionSource.Delay > 0 ? $" {transitionSource.Delay}ms" : string.Empty;
          cssProps["transition"] = $"all {transitionSource.Duration}ms {transitionSource.Easing}{transitionDelay}";
        }
      }

      foreach (var (trigger, animations) in byTrigger)
      {
        var combined = string.Join(", ", animations);
        var pseudoClass = trigger switch
        {
          "hover" => "hover",
          "click" => "active",
          "focus" => "focus",
          _ => null, // onLoad + loop go on the base rule
        };

        if (pseudoClass is not null)
          ctx.Styles.AddPseudo(cssClasses.TargetClass, pseudoClass, new Dictionary<string, string> { ["animation"] = combined });
        else
          cssProps["animation"] = combined;
      }
    }
    ctx.Styles.AddBase(cssClasses.TargetClass, cssProps);
    ctx.Styles.AddVariants(cssClasses.TargetClass, node.Variants);

    var sb = new StringBuilder();
    var previousContext = CurrentContext.Value;

    try
    {
      CurrentContext.Value = ctx;
      sb.Append(OpenNodeComment(node, ctx));
      sb.Append(EmitElement(node, ctx));
      sb.Append(CloseNodeComment(node, ctx));
    }
    finally
    {
      CurrentContext.Value = previousContext;
    }

    return sb.ToString();
  }

  private static bool TryResolveStatePseudoClass(string trigger, out string pseudoClass)
  {
    switch (trigger.ToLowerInvariant())
    {
      case "hover":
        pseudoClass = "hover";
        return true;
      case "click":
        pseudoClass = "active";
        return true;
      default:
        pseudoClass = string.Empty;
        return false;
    }
  }

  private static bool TryBuildStateTransform(IREffect effect, out string transform)
  {
    transform = string.Empty;

    var transforms = new List<string>();
    var offsetX = effect.OffsetX ?? 0d;
    var offsetY = effect.OffsetY ?? 0d;
    var scale = effect.Scale ?? 1d;
    var rotate = effect.Rotate ?? 0d;
    var skewX = effect.SkewX ?? 0d;
    var skewY = effect.SkewY ?? 0d;

    if (Math.Abs(offsetX) > 0.0001d || Math.Abs(offsetY) > 0.0001d)
      transforms.Add($"translate({offsetX.ToString("0.###", System.Globalization.CultureInfo.InvariantCulture)}px, {offsetY.ToString("0.###", System.Globalization.CultureInfo.InvariantCulture)}px)");

    if (Math.Abs(scale - 1d) > 0.0001d)
      transforms.Add($"scale({scale.ToString("0.###", System.Globalization.CultureInfo.InvariantCulture)})");

    if (Math.Abs(rotate) > 0.0001d)
    {
      var rotationValue = rotate.ToString("0.###", System.Globalization.CultureInfo.InvariantCulture);
      transforms.Add(string.Equals(effect.RotationMode, "3d", StringComparison.OrdinalIgnoreCase)
        ? $"rotateY({rotationValue}deg)"
        : $"rotate({rotationValue}deg)");
    }

    if (Math.Abs(skewX) > 0.0001d || Math.Abs(skewY) > 0.0001d)
      transforms.Add($"skew({skewX.ToString("0.###", System.Globalization.CultureInfo.InvariantCulture)}deg, {skewY.ToString("0.###", System.Globalization.CultureInfo.InvariantCulture)}deg)");

    if (transforms.Count == 0)
      return false;

    transform = string.Join(' ', transforms);
    return true;
  }

  protected abstract string EmitElement(IRNode node, EmitContext ctx);

  protected string NodeClass(IRNode node)
  {
    var context = CurrentContext.Value ?? throw new InvalidOperationException("Emit context is not available.");
    var cssClasses = node is null ? throw new ArgumentNullException(nameof(node)) : context.GetCssClasses(node);
    return $" {ClassAttributeName}=\"{cssClasses.MarkupClasses}\"";
  }

  protected static string EmitChildren(IRNode node, EmitContext ctx)
  {
    if (node.Children.Count == 0) return string.Empty;

    var sb = new StringBuilder();
    foreach (var child in node.Children)
      sb.Append(ctx.EmitChild(child, ctx.Deeper()));

    return sb.ToString();
  }

  protected static string GetProp(IRNode node, string key, string defaultValue = "")
  {
    if (!node.Props.TryGetValue(key, out var val)) return defaultValue;
    return val switch
    {
      null => defaultValue,
      JsonElement je => je.ValueKind == JsonValueKind.String
        ? je.GetString() ?? defaultValue
        : je.ToString(),
      _ => val.ToString() ?? defaultValue
    };
  }

  protected static bool GetBoolProp(IRNode node, string key, bool defaultValue = false)
  {
    if (!node.Props.TryGetValue(key, out var val)) return defaultValue;
    return val switch
    {
      null => defaultValue,
      JsonElement je => je.ValueKind == JsonValueKind.True,
      bool b => b,
      _ => bool.TryParse(val?.ToString(), out var parsed) ? parsed : defaultValue
    };
  }

  protected static int GetIntProp(IRNode node, string key, int defaultValue = 0)
  {
    if (!node.Props.TryGetValue(key, out var val)) return defaultValue;
    return val switch
    {
      null => defaultValue,
      JsonElement je => je.TryGetInt32(out var i) ? i : defaultValue,
      int i => i,
      _ => int.TryParse(val?.ToString(), out var parsed) ? parsed : defaultValue
    };
  }

  protected static string AppendAriaLabel(IRNode node, string attrs)
  {
    var ariaLabel = GetProp(node, "ariaLabel");
    return string.IsNullOrWhiteSpace(ariaLabel)
      ? attrs
      : $"{attrs} aria-label=\"{ariaLabel}\"";
  }

  protected static string ResolveTag(IRNode node, string defaultTag, params string[] allowedTags)
  {
    var requestedTag = GetProp(node, "tag");
    if (string.IsNullOrWhiteSpace(requestedTag))
    {
      return defaultTag;
    }

    foreach (var allowedTag in allowedTags)
    {
      if (string.Equals(allowedTag, requestedTag, StringComparison.OrdinalIgnoreCase))
      {
        return allowedTag;
      }
    }

    return defaultTag;
  }

  protected static string SelfClosing(string tag, string attrs, string indent) =>
      $"{indent}<{tag}{attrs} />\n";

  protected static string Paired(string tag, string attrs, string inner, string indent, bool inlineContent = false)
  {
    if (string.IsNullOrEmpty(inner))
      return $"{indent}<{tag}{attrs}></{tag}>\n";

    if (inlineContent)
      return $"{indent}<{tag}{attrs}>{inner}</{tag}>\n";

    return $"{indent}<{tag}{attrs}>\n{inner}{indent}</{tag}>\n";
  }
}
