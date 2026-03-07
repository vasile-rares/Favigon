export interface IRNode {
  version: string;
  id: string;
  type: string;
  props: Record<string, unknown>;
  layout?: IRLayout;
  style?: IRStyle;
  responsive: Record<string, IRResponsiveOverride>;
  children: IRNode[];
}

export interface IRLayout {
  mode: string;
  direction?: string;
  alignment?: string;
  justify?: string;
  gap?: number;
  padding?: IRSpacing;
  margin?: IRSpacing;
  wrap?: string;
  columns?: number;
  rows?: number;
}

export interface IRSpacing {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
}

export interface IRStyle {
  color?: string;
  background?: string;
  borderRadius?: number;
  fontSize?: number;
  fontWeight?: number;
  fontFamily?: string;
  fontStyle?: string;
  textAlign?: string;
  lineHeight?: number;
  letterSpacing?: number;
  shadow?: string;
  border?: string;
  opacity?: number;
  width?: string;
  height?: string;
  minWidth?: string;
  maxWidth?: string;
  minHeight?: string;
  maxHeight?: string;
}

export interface IRResponsiveOverride {
  layout?: IRLayout;
  style?: IRStyle;
  props?: Record<string, unknown>;
}
