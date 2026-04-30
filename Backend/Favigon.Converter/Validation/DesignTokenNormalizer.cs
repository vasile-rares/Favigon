using Favigon.Converter.Models;

namespace Favigon.Converter.Validation;

/// <summary>
/// Mechanically snaps AI-generated style values to the design token scale,
/// eliminating random off-scale values before validation runs.
/// Phase 1 of deterministic enforcement.
/// </summary>
public static class DesignTokenNormalizer
{
  // Typography scale (px). Matches system prompt: 12 | 14 | 16 | 24 | 32 | 48 | 64
  private static readonly int[] FontSizesPx = [12, 14, 16, 24, 32, 48, 64];

  // Spacing scale — multiples of 8 (incl. 0). Matches system prompt: 0 | 8 | 16 | ... | 120
  private static readonly int[] SpacingPx = [0, 8, 16, 24, 32, 40, 48, 64, 80, 96, 120];

  // Border-radius token set. 9999 stays as-is (pill/circle), guard with exact-match first.
  private static readonly int[] BorderRadiiPx = [0, 4, 8, 12, 20, 9999];

  // Max overflow auto-correctable without going to AI repair.
  // Snapping spacing values introduces up to ~4px rounding error per value,
  // so anything under 64px is safely a snap artifact, not a real layout bug.
  private const double AutoFixOverflowThreshold = 64.0;

  /// <summary>
  /// Normalizes the full node tree in-place.
  /// Step 1: snap style values to token scale.
  /// Step 2: fix small flex-row overflows caused by snapping, without needing AI repair.
  /// </summary>
  public static void Normalize(IRNode root)
  {
    NormalizeNode(root);
    EnforceFrameConstraints(root);
    FixFlexRowOverflows(root);
  }

  /// <summary>
  /// Enforces hard constraints on the root Frame that the AI frequently violates:
  /// - Height MUST be fit-content (AI often sets 100px or other fixed values)
  /// - Width MUST be 1280px
  /// - No minHeight / maxHeight (collapsed or clipped pages)
  /// </summary>
  private static void EnforceFrameConstraints(IRNode root)
  {
    if (root.Type != "Frame") return;

    root.Style ??= new IRStyle();
    root.Style.Height = new IRLength { Value = 0, Unit = "fit-content" };
    root.Style.Width ??= new IRLength { Value = 1280, Unit = "px" };
    root.Style.MinHeight = null;
    root.Style.MaxHeight = null;
  }

  private static void NormalizeNode(IRNode node)
  {
    if (node.Style is not null)
      NormalizeStyle(node.Style);

    if (node.Layout is not null)
      NormalizeLayout(node.Layout);

    foreach (var variant in node.Variants.Values)
    {
      if (variant.Style is not null) NormalizeStyle(variant.Style);
      if (variant.Layout is not null) NormalizeLayout(variant.Layout);
    }

    foreach (var child in node.Children)
      NormalizeNode(child);
  }

  private static void NormalizeStyle(IRStyle style)
  {
    style.FontSize = SnapFontSize(style.FontSize);

    style.BorderRadius = SnapBorderRadius(style.BorderRadius);
    style.BorderTopLeftRadius = SnapBorderRadius(style.BorderTopLeftRadius);
    style.BorderTopRightRadius = SnapBorderRadius(style.BorderTopRightRadius);
    style.BorderBottomRightRadius = SnapBorderRadius(style.BorderBottomRightRadius);
    style.BorderBottomLeftRadius = SnapBorderRadius(style.BorderBottomLeftRadius);

    style.Padding = SnapSpacing(style.Padding);
    style.Margin = SnapSpacing(style.Margin);
  }

  private static void NormalizeLayout(IRLayout layout)
  {
    layout.Gap = SnapSpacingLength(layout.Gap);
    layout.RowGap = SnapSpacingLength(layout.RowGap);
    layout.ColumnGap = SnapSpacingLength(layout.ColumnGap);
  }

  private static IRLength? SnapFontSize(IRLength? len)
  {
    if (len is null || len.Unit != "px") return len;
    return new IRLength { Value = SnapToNearest(FontSizesPx, (int)Math.Round(len.Value)), Unit = "px" };
  }

  private static IRLength? SnapBorderRadius(IRLength? len)
  {
    if (len is null || len.Unit != "px") return len;
    var rounded = (int)Math.Round(len.Value);
    // Large values (≥ 500) always map to pill
    if (rounded >= 500) return new IRLength { Value = 9999, Unit = "px" };
    return new IRLength { Value = SnapToNearest(BorderRadiiPx, rounded), Unit = "px" };
  }

  private static IRLength? SnapSpacingLength(IRLength? len)
  {
    if (len is null || len.Unit != "px") return len;
    return new IRLength { Value = SnapToNearest(SpacingPx, (int)Math.Round(len.Value)), Unit = "px" };
  }

  private static IRSpacing? SnapSpacing(IRSpacing? spacing)
  {
    if (spacing is null) return null;
    spacing.Top = SnapSpacingLength(spacing.Top);
    spacing.Right = SnapSpacingLength(spacing.Right);
    spacing.Bottom = SnapSpacingLength(spacing.Bottom);
    spacing.Left = SnapSpacingLength(spacing.Left);
    return spacing;
  }

  private static int SnapToNearest(int[] scale, int value)
  {
    var best = scale[0];
    var bestDist = Math.Abs(value - best);
    foreach (var s in scale)
    {
      var dist = Math.Abs(value - s);
      if (dist < bestDist)
      {
        best = s;
        bestDist = dist;
      }
    }
    return best;
  }

  /// <summary>
  /// Recursively finds flex-row containers where all children have px widths
  /// and the total exceeds the available inner width by at most <see cref="AutoFixOverflowThreshold"/>px.
  /// Shrinks the widest child to close the gap — no AI call needed.
  /// Overflows larger than the threshold are left for the validator to report to AI repair.
  /// </summary>
  private static void FixFlexRowOverflows(IRNode node)
  {
    if (node.Layout?.Mode == LayoutMode.Flex &&
        node.Layout.Direction is FlexDirection.Row or null)
    {
      var parentWidth = node.Style?.Width;
      if (parentWidth?.Unit == "px" && node.Children.Count > 1)
      {
        // Only act when every child has an explicit px width — ambiguous otherwise
        if (node.Children.All(c => c.Style?.Width?.Unit == "px"))
        {
          var paddingLeft = node.Style?.Padding?.Left?.Unit == "px" ? node.Style.Padding.Left.Value : 0;
          var paddingRight = node.Style?.Padding?.Right?.Unit == "px" ? node.Style.Padding.Right.Value : 0;
          var gapLen = node.Layout.ColumnGap ?? node.Layout.Gap;
          var gapPx = gapLen?.Unit == "px" ? gapLen.Value : 0;

          var available = parentWidth.Value - paddingLeft - paddingRight;
          var totalChildren = node.Children.Sum(c => c.Style!.Width!.Value)
                              + gapPx * (node.Children.Count - 1);
          var overflow = totalChildren - available;

          if (overflow > 0.5 && overflow <= AutoFixOverflowThreshold)
          {
            // Shrink the widest child by exactly the overflow amount
            var widest = node.Children.MaxBy(c => c.Style!.Width!.Value)!;
            widest.Style!.Width = new IRLength { Value = widest.Style.Width!.Value - overflow, Unit = "px" };
          }
        }
      }
    }

    foreach (var child in node.Children)
      FixFlexRowOverflows(child);
  }
}
