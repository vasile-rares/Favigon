using Favigon.Converter.Models;
using Favigon.Converter.Utils;

namespace Favigon.Converter.Generators.Html;

public sealed class HtmlTextMapper : HtmlMapperBase
{
  public override string Type => "Text";
  protected override string EmitElement(IRNode node, EmitContext ctx) =>
    MapperLogic.EmitText(node, ctx, NodeClass, BuildLinkAttrs);
}

public sealed class HtmlImageMapper : HtmlMapperBase
{
  public override string Type => "Image";
  protected override string EmitElement(IRNode node, EmitContext ctx) =>
    MapperLogic.EmitImage(node, ctx, NodeClass, BuildLinkAttrs);
}

public sealed class HtmlContainerMapper : HtmlMapperBase
{
  public override string Type => "Container";
  protected override string EmitElement(IRNode node, EmitContext ctx) =>
    MapperLogic.EmitContainer(node, ctx, NodeClass, BuildLinkAttrs);
}

public sealed class HtmlFrameMapper : HtmlMapperBase
{
  public override string Type => "Frame";
  protected override string EmitElement(IRNode node, EmitContext ctx) =>
    MapperLogic.EmitFrame(node, ctx, NodeClass, BuildLinkAttrs);
}

public sealed class HtmlSvgMapper : HtmlMapperBase
{
  public override string Type => "Svg";
  protected override string EmitElement(IRNode node, EmitContext ctx) =>
    MapperLogic.EmitSvg(node, ctx, NodeClass);
}