export interface IRNode {
  id: string;
  type: string;
  props: Record<string, unknown>;
  layout?: IRLayout;
  style?: IRStyle;
  position?: IRPosition;
  variants: Record<string, IRVariant>;
  children: IRNode[];
  meta: IRMeta;
}

export interface IRLayout {
  mode: LayoutMode;
  direction?: FlexDirection;
  align?: AlignItems;
  justify?: JustifyContent;
  gap?: IRLength;
  wrap?: boolean;
  columns?: number;
  rows?: number;
  gridTemplateColumns?: string;
  gridTemplateRows?: string;
}

export interface IRPosition {
  mode: PositionMode;
  x?: IRLength;
  y?: IRLength;
  top?: IRLength;
  right?: IRLength;
  bottom?: IRLength;
  left?: IRLength;
}

export interface IRStyle {
  color?: string;
  background?: string;

  width?: IRLength;
  height?: IRLength;

  minWidth?: IRLength;
  maxWidth?: IRLength;

  minHeight?: IRLength;
  maxHeight?: IRLength;

  fontSize?: IRLength;
  fontWeight?: number;
  fontFamily?: string;

  lineHeight?: IRLength;
  letterSpacing?: IRLength;

  textAlign?: string;

  borderRadius?: IRLength;
  border?: IRBorder;

  overflow?: 'clip' | 'visible';
  shadow?: string;

  opacity?: number;

  padding?: IRSpacing;
  margin?: IRSpacing;
}

export interface IRLength {
  value: number;
  unit: string; // "px" | "%" | "rem" | "em" | "vw" | "vh"
}

export interface IRSpacing {
  top?: IRLength;
  right?: IRLength;
  bottom?: IRLength;
  left?: IRLength;
}

export interface IRBorder {
  width?: IRLength;
  color?: string;
  /** Defaults to 'Solid' */
  style: BorderStyle;
  /** Selective sides — if all are absent the border applies to all four sides */
  top?: boolean;
  right?: boolean;
  bottom?: boolean;
  left?: boolean;
}

export interface IRMeta {
  locked: boolean;
  hidden: boolean;
  selected: boolean;
  componentInstanceId?: string;
}

export interface IRVariant {
  layout?: IRLayout;
  style?: IRStyle;
  props?: Record<string, unknown>;
}

// Must match C# enum names exactly (JsonStringEnumConverter uses PascalCase names)
export type LayoutMode = 'Block' | 'Flex' | 'Grid';
export type PositionMode = 'Flow' | 'Relative' | 'Absolute' | 'Fixed' | 'Sticky';
export type FlexDirection = 'Row' | 'Column' | 'RowReverse' | 'ColumnReverse';
export type AlignItems = 'Start' | 'Center' | 'End' | 'Stretch' | 'Baseline';
export type JustifyContent =
  | 'Start'
  | 'Center'
  | 'End'
  | 'SpaceBetween'
  | 'SpaceAround'
  | 'SpaceEvenly';
export type BorderStyle = 'Solid' | 'Dashed' | 'Dotted' | 'Double' | 'None';

// Helper to create a pixel IRLength
export function px(value: number): IRLength {
  return { value, unit: 'px' };
}

export function length(value: number, unit: string): IRLength {
  return { value, unit };
}
