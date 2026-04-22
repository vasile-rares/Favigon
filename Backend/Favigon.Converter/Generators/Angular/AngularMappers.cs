using Favigon.Converter.Models;
using Favigon.Converter.Utils;

namespace Favigon.Converter.Generators.Angular;

public sealed class AngularTextMapper : AngularMapperBase
{
  public override string Type => "Text";
  protected override string EmitElement(IRNode node, EmitContext ctx) =>
    MapperLogic.EmitText(node, ctx, NodeClass, BuildLinkAttrs);
}

public sealed class AngularImageMapper : AngularMapperBase
{
  public override string Type => "Image";
  // Angular uses property binding syntax: [src]="'value'"
  protected override string EmitElement(IRNode node, EmitContext ctx) =>
    MapperLogic.EmitImage(node, ctx, NodeClass, BuildLinkAttrs,
      (src, alt) => $" [src]=\"'{src}'\" alt=\"{alt}\"");
}

public sealed class AngularContainerMapper : AngularMapperBase
{
  public override string Type => "Container";
  protected override string EmitElement(IRNode node, EmitContext ctx) =>
    MapperLogic.EmitContainer(node, ctx, NodeClass, BuildLinkAttrs);
}

public sealed class AngularFrameMapper : AngularMapperBase
{
  public override string Type => "Frame";
  protected override string EmitElement(IRNode node, EmitContext ctx) =>
    MapperLogic.EmitFrame(node, ctx, NodeClass, BuildLinkAttrs);
}