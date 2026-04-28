using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using Favigon.Converter.Models;

namespace Favigon.Converter.Utils;

public static class AnimationPresets
{
  public static bool TryBuild(IREffect effect, out string name, out string body)
  {
    name = string.Empty;
    body = string.Empty;

    if (string.IsNullOrWhiteSpace(effect.Preset))
      return false;

    var motion = ResolveMotion(effect);
    var signature = string.Join('|',
      effect.Trigger,
      effect.Preset,
      FormatNumber(motion.Opacity),
      FormatNumber(motion.Scale),
      FormatNumber(motion.Rotate),
      motion.RotationMode,
      FormatNumber(motion.SkewX),
      FormatNumber(motion.SkewY),
      FormatNumber(motion.OffsetX),
      FormatNumber(motion.OffsetY),
      effect.Direction,
      effect.Delay.ToString(CultureInfo.InvariantCulture));

    name = $"{effect.Preset}_{BuildHash(signature)}";
    body = string.Equals(effect.Trigger, "loop", StringComparison.OrdinalIgnoreCase)
      ? BuildLoopBody(motion, effect)
      : BuildBody(motion);
    return true;
  }

  public static int GetAnimationDuration(IREffect effect)
  {
    if (!string.Equals(effect.Trigger, "loop", StringComparison.OrdinalIgnoreCase))
      return Math.Max(0, effect.Duration);

    var segmentDuration = Math.Max(0, effect.Duration) + Math.Max(0, effect.Delay);
    return IsMirrorLoop(effect) ? segmentDuration * 2 : segmentDuration;
  }

  public static string GetAnimationDelay(IREffect effect)
  {
    if (string.Equals(effect.Trigger, "loop", StringComparison.OrdinalIgnoreCase))
      return "0s";

    return effect.Delay > 0 ? $"{effect.Delay}ms" : "0s";
  }

  public static string GetAnimationDirection(IREffect effect)
  {
    if (!string.Equals(effect.Trigger, "loop", StringComparison.OrdinalIgnoreCase))
      return effect.Direction;

    return IsMirrorLoop(effect) ? "normal" : effect.Direction;
  }

  private static string BuildBody(ResolvedEffectMotion motion)
  {
    var fromRules = BuildFromRules(motion);

    return $"  from {{ {string.Join(" ", fromRules)} }}\n  to   {{ }}\n";
  }

  private static string BuildLoopBody(ResolvedEffectMotion motion, IREffect effect)
  {
    var activeDuration = Math.Max(0, effect.Duration);
    var repeatPause = Math.Max(0, effect.Delay);

    if (activeDuration == 0 || repeatPause == 0)
    {
      return IsMirrorLoop(effect)
        ? BuildMirrorBody(BuildFromRules(motion))
        : BuildBody(motion);
    }

    var fromRules = BuildFromRules(motion);
    return IsMirrorLoop(effect)
      ? BuildMirrorLoopBody(fromRules, activeDuration, repeatPause)
      : BuildLoopPauseBody(fromRules, activeDuration, repeatPause);
  }

  private static List<string> BuildFromRules(ResolvedEffectMotion motion)
  {
    var fromRules = new List<string>();

    if (Math.Abs(motion.Opacity - 1d) > 0.0001d)
      fromRules.Add($"opacity: {FormatNumber(motion.Opacity)};");

    var transform = BuildTransform(motion);
    if (transform.Length > 0)
      fromRules.Add($"transform: {transform};");

    if (fromRules.Count == 0)
      fromRules.Add("opacity: 1;");

    return fromRules;
  }

  private static string BuildLoopPauseBody(IReadOnlyList<string> fromRules, int activeDuration, int repeatPause)
  {
    var activeRatio = activeDuration / (double)(activeDuration + repeatPause) * 100d;

    return new StringBuilder()
      .Append(BuildKeyframeRule("0%", fromRules))
      .Append(BuildKeyframeRule($"{FormatPercentage(activeRatio)}%", []))
      .Append(BuildKeyframeRule("100%", []))
      .ToString();
  }

  private static string BuildMirrorBody(IReadOnlyList<string> fromRules)
  {
    return new StringBuilder()
      .Append(BuildKeyframeRule("0%", fromRules))
      .Append(BuildKeyframeRule("50%", []))
      .Append(BuildKeyframeRule("100%", fromRules))
      .ToString();
  }

  private static string BuildMirrorLoopBody(IReadOnlyList<string> fromRules, int activeDuration, int repeatPause)
  {
    var totalCycle = (activeDuration + repeatPause) * 2d;
    var forwardEnd = activeDuration / totalCycle * 100d;
    var holdEnd = (activeDuration + repeatPause) / totalCycle * 100d;
    var returnEnd = (activeDuration + repeatPause + activeDuration) / totalCycle * 100d;

    return new StringBuilder()
      .Append(BuildKeyframeRule("0%", fromRules))
      .Append(BuildKeyframeRule($"{FormatPercentage(forwardEnd)}%", []))
      .Append(BuildKeyframeRule($"{FormatPercentage(holdEnd)}%", []))
      .Append(BuildKeyframeRule($"{FormatPercentage(returnEnd)}%", fromRules))
      .Append(BuildKeyframeRule("100%", fromRules))
      .ToString();
  }

  private static string BuildKeyframeRule(string selector, IReadOnlyList<string> rules)
    => rules.Count > 0
      ? $"  {selector} {{ {string.Join(" ", rules)} }}\n"
      : $"  {selector} {{ }}\n";

  private static bool IsMirrorLoop(IREffect effect)
    => string.Equals(effect.Direction, "alternate", StringComparison.OrdinalIgnoreCase)
      || string.Equals(effect.Direction, "alternate-reverse", StringComparison.OrdinalIgnoreCase);

  private static string BuildTransform(ResolvedEffectMotion motion)
  {
    var transforms = new List<string>();

    if (Math.Abs(motion.OffsetX) > 0.0001d || Math.Abs(motion.OffsetY) > 0.0001d)
      transforms.Add($"translate({FormatNumber(motion.OffsetX)}px, {FormatNumber(motion.OffsetY)}px)");

    if (Math.Abs(motion.Scale - 1d) > 0.0001d)
      transforms.Add($"scale({FormatNumber(motion.Scale)})");

    if (Math.Abs(motion.Rotate) > 0.0001d)
      transforms.Add(
        string.Equals(motion.RotationMode, "3d", StringComparison.OrdinalIgnoreCase)
          ? $"rotateY({FormatNumber(motion.Rotate)}deg)"
          : $"rotate({FormatNumber(motion.Rotate)}deg)");

    if (Math.Abs(motion.SkewX) > 0.0001d || Math.Abs(motion.SkewY) > 0.0001d)
      transforms.Add($"skew({FormatNumber(motion.SkewX)}deg, {FormatNumber(motion.SkewY)}deg)");

    return string.Join(' ', transforms);
  }

  private static ResolvedEffectMotion ResolveMotion(IREffect effect)
  {
    var defaults = effect.Preset.ToLowerInvariant() switch
    {
      "custom" => new ResolvedEffectMotion(0d, 1d, 0d, "2d", 0d, 0d, 0d, 0d),
      "fadein" => new ResolvedEffectMotion(0d, 1d, 0d, "2d", 0d, 0d, 0d, 0d),
      "scalein" => new ResolvedEffectMotion(0d, 0.9d, 0d, "2d", 0d, 0d, 0d, 0d),
      "scaleinbottom" => new ResolvedEffectMotion(0d, 0.88d, 0d, "2d", 0d, 0d, 0d, 24d),
      "fliphorizontal" => new ResolvedEffectMotion(0d, 0.94d, 0d, "2d", 0d, -18d, 0d, 0d),
      "flipvertical" => new ResolvedEffectMotion(0d, 0.94d, 0d, "2d", 18d, 0d, 0d, 0d),
      "slideintop" => new ResolvedEffectMotion(0d, 1d, 0d, "2d", 0d, 0d, 0d, -24d),
      "fadeout" => new ResolvedEffectMotion(0d, 1d, 0d, "2d", 0d, 0d, 0d, 0d),
      "slideinup" => new ResolvedEffectMotion(0d, 1d, 0d, "2d", 0d, 0d, 0d, 24d),
      "slideindown" => new ResolvedEffectMotion(0d, 1d, 0d, "2d", 0d, 0d, 0d, -24d),
      "slideinleft" => new ResolvedEffectMotion(0d, 1d, 0d, "2d", 0d, 0d, -24d, 0d),
      "slideinright" => new ResolvedEffectMotion(0d, 1d, 0d, "2d", 0d, 0d, 24d, 0d),
      "slideinbottom" => new ResolvedEffectMotion(0d, 1d, 0d, "2d", 0d, 0d, 0d, 24d),
      "scaleout" => new ResolvedEffectMotion(0d, 1.08d, 0d, "2d", 0d, 0d, 0d, 0d),
      "spin" => new ResolvedEffectMotion(0d, 1d, -180d, "2d", 0d, 0d, 0d, 0d),
      "pulse" => new ResolvedEffectMotion(0d, 0.94d, 0d, "2d", 0d, 0d, 0d, 0d),
      "bounce" => new ResolvedEffectMotion(0d, 1d, 0d, "2d", 0d, 0d, 0d, 24d),
      "shake" => new ResolvedEffectMotion(0d, 1d, 0d, "2d", 0d, 0d, 18d, 0d),
      _ => new ResolvedEffectMotion(0d, 1d, 0d, "2d", 0d, 0d, 0d, 0d),
    };

    return new ResolvedEffectMotion(
      effect.Opacity ?? defaults.Opacity,
      effect.Scale ?? defaults.Scale,
      effect.Rotate ?? defaults.Rotate,
      effect.RotationMode ?? "2d",
      effect.SkewX ?? defaults.SkewX,
      effect.SkewY ?? defaults.SkewY,
      effect.OffsetX ?? defaults.OffsetX,
      effect.OffsetY ?? defaults.OffsetY);
  }

  private static string BuildHash(string value)
  {
    var bytes = MD5.HashData(Encoding.UTF8.GetBytes(value));
    return Convert.ToHexString(bytes).ToLowerInvariant()[..8];
  }

  private static string FormatNumber(double value)
    => value.ToString("0.###", CultureInfo.InvariantCulture);

  private static string FormatPercentage(double value)
    => value.ToString("0.###", CultureInfo.InvariantCulture);

  private readonly record struct ResolvedEffectMotion(
    double Opacity,
    double Scale,
    double Rotate,
    string RotationMode,
    double SkewX,
    double SkewY,
    double OffsetX,
    double OffsetY);
}
