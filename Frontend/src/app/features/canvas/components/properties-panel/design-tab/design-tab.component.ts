import { CommonModule } from '@angular/common';
import { Component, ViewEncapsulation, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DropdownSelectComponent, ToggleGroupComponent, ContextMenuComponent } from '@app/shared';
import { NumberInputComponent } from '../number-input/number-input.component';
import { FieldInputComponent } from '../field-input/field-input.component';
import type { DropdownSelectOption, ToggleGroupOption, ContextMenuItem } from '@app/shared';
import {
  CanvasAlignItems,
  CanvasDisplayMode,
  CanvasCornerRadii,
  CanvasBorderSides,
  CanvasBorderWidths,
  CanvasCursorType,
  CanvasEffect,
  CanvasEffectEasing,
  CanvasEffectOffScreenBehavior,
  CanvasEffectPreset,
  CanvasEffectTrigger,
  CanvasElement,
  CanvasElementType,
  CanvasFontSizeUnit,
  CanvasFontStyle,
  CanvasFlexDirection,
  CanvasFlexWrap,
  CanvasJustifyContent,
  CanvasBackfaceVisibility,
  CanvasConstraintSizeMode,
  CanvasLinkType,
  CanvasOverflowMode,
  CanvasPageModel,
  CanvasPositionMode,
  CanvasRotationMode,
  CanvasSemanticTag,
  CanvasSizeMode,
  CanvasSpacing,
  CanvasTransformOption,
  CanvasTextSpacingUnit,
  CanvasTextAlign,
  CanvasTextVerticalAlign,
} from '@app/core';

import {
  getDefaultCornerRadius,
  getResolvedCornerRadii,
  hasPerCornerRadius,
} from '../../../utils/element/canvas-element-normalization.util';
import { roundToTwoDecimals } from '../../../utils/canvas-math.util';
import {
  getAllowedCustomAccessibilityTags,
  getDefaultAccessibilityTag,
  getResolvedCanvasTag,
  hasCanvasElementLink,
  normalizeCanvasAccessibilityLabel,
  normalizeStoredCanvasTag,
  supportsCustomAccessibilityTag,
} from '../../../utils/element/canvas-accessibility.util';
import {
  CanvasConstraintField,
  CanvasSizeAxis,
  deriveCanvasConstraintValueFromPixels,
  getCanvasConstraintMode,
  getCanvasConstraintModeField,
  getCanvasConstraintSizeValueField,
  getCanvasConstraintSizingValue,
  getCanvasConstraintSuffix,
  getCanvasConstraintValue,
  deriveCanvasSizeValueFromPixels,
  getCanvasFixedSize,
  getCanvasSizeMode,
  getCanvasSizeModeField,
  getCanvasSizeValueField,
  getCanvasSizingValue,
  getCanvasSizeSuffix,
  normalizeCanvasConstraintMode,
  normalizeCanvasConstraintValue,
  normalizeCanvasSizeMode,
  normalizeCanvasSizeValue,
  resolveCanvasConstraintPixels,
  resolveCanvasPixelsFromMode,
  shouldDisableCanvasSizeInput,
  supportsCanvasConstraintSizeMode,
  supportsCanvasSizeMode,
} from '../../../utils/element/canvas-sizing.util';
import {
  buildCanvasShadowCss,
  DEFAULT_EDITABLE_CANVAS_SHADOW,
  getCanvasShadowCss,
  hasCanvasShadow,
  normalizeCanvasShadowValue,
  resolveEditableCanvasShadow,
} from '../../../utils/element/canvas-shadow.util';
import {
  createDefaultCanvasEffect,
  resolveCanvasEffect,
} from '../../../utils/element/canvas-effect.util';
import { FrameTemplateSelection } from '../../../canvas.types';
import { ExtrasSectionComponent } from './sections/extras-section.component';
import { DimensionsSectionComponent } from './sections/dimensions-section.component';
import { LayoutSectionComponent } from './sections/layout-section.component';
import { AppearanceSectionComponent } from './sections/appearance-section.component';
import { TypographySectionComponent } from './sections/typography-section.component';
import { TransformsEffectsSectionComponent } from './sections/transforms-effects-section.component';

type CornerRadiusMode = 'full' | 'per-corner';
type PaddingMode = 'full' | 'per-side';
type AccessibilityField = 'tag' | 'ariaLabel';
type DimensionConstraintField = 'minWidth' | 'maxWidth' | 'minHeight' | 'maxHeight';
type EffectPopupView = 'main' | 'transition' | 'fill' | 'shadow';

type EditableNumericField =
  | 'x'
  | 'y'
  | 'width'
  | 'height'
  | 'fontSize'
  | 'letterSpacing'
  | 'lineHeight'
  | 'strokeWidth'
  | 'opacity'
  | 'cornerRadius'
  | 'gap';

type EditableTypographyField =
  | 'fontFamily'
  | 'fontWeight'
  | 'fontStyle'
  | 'textAlign'
  | 'textVerticalAlign';

type EditableTextMetricUnitField = 'fontSizeUnit' | 'letterSpacingUnit' | 'lineHeightUnit';

interface TransformOptionDefinition {
  id: CanvasTransformOption;
  label: string;
}

interface CornerRadiusFieldDefinition {
  key: keyof CanvasCornerRadii;
  label: string;
  ariaLabel: string;
}

interface PaddingFieldDefinition {
  key: keyof CanvasSpacing;
  label: string;
  ariaLabel: string;
}

interface AccessibilityFieldDefinition {
  id: AccessibilityField;
  label: string;
}

interface DimensionModeDefinition {
  mode: CanvasSizeMode;
  label: string;
}

interface DimensionConstraintModeDefinition {
  mode: CanvasConstraintSizeMode;
  label: string;
}

interface DimensionConstraintFieldDefinition {
  id: DimensionConstraintField;
  label: string;
}

const TRANSFORM_OPTION_DEFINITIONS: readonly TransformOptionDefinition[] = [
  { id: 'scale', label: 'Scale' },
  { id: 'rotate', label: 'Rotate' },
  { id: 'skew', label: 'Skew' },
  { id: 'depth', label: 'Depth' },
  { id: 'perspective', label: 'Perspective' },
  { id: 'origin', label: 'Origin' },
  { id: 'backface', label: 'Backface' },
  { id: 'preserve3d', label: 'Preserve 3D' },
] as const;

const CORNER_RADIUS_FIELD_DEFINITIONS: readonly CornerRadiusFieldDefinition[] = [
  { key: 'topLeft', label: 'TL', ariaLabel: 'Top left corner radius' },
  { key: 'topRight', label: 'TR', ariaLabel: 'Top right corner radius' },
  { key: 'bottomLeft', label: 'BL', ariaLabel: 'Bottom left corner radius' },
  { key: 'bottomRight', label: 'BR', ariaLabel: 'Bottom right corner radius' },
] as const;

const PADDING_FIELD_DEFINITIONS: readonly PaddingFieldDefinition[] = [
  { key: 'top', label: 'T', ariaLabel: 'Padding top' },
  { key: 'right', label: 'R', ariaLabel: 'Padding right' },
  { key: 'left', label: 'L', ariaLabel: 'Padding left' },
  { key: 'bottom', label: 'B', ariaLabel: 'Padding bottom' },
] as const;

const ACCESSIBILITY_FIELD_DEFINITIONS: readonly AccessibilityFieldDefinition[] = [
  { id: 'tag', label: 'Tag' },
  { id: 'ariaLabel', label: 'Aria Label' },
] as const;

const DIMENSION_MODE_DEFINITIONS: readonly DimensionModeDefinition[] = [
  { mode: 'fixed', label: 'Fixed' },
  { mode: 'relative', label: 'Relative' },
  { mode: 'fill', label: 'Fill' },
  { mode: 'fit-content', label: 'Fit Content' },
  { mode: 'viewport', label: 'Viewport' },
  { mode: 'fit-image', label: 'Fit Image' },
] as const;

const DIMENSION_CONSTRAINT_MODE_DEFINITIONS: readonly DimensionConstraintModeDefinition[] = [
  { mode: 'fixed', label: 'Fixed' },
  { mode: 'relative', label: 'Relative' },
] as const;

const DIMENSION_CONSTRAINT_FIELD_DEFINITIONS: readonly DimensionConstraintFieldDefinition[] = [
  { id: 'minWidth', label: 'Min Width' },
  { id: 'maxWidth', label: 'Max Width' },
  { id: 'minHeight', label: 'Min Height' },
  { id: 'maxHeight', label: 'Max Height' },
] as const;

const TRANSFORM_DEPTH_MIN = -1000;
const TRANSFORM_DEPTH_MAX = 1000;
const TRANSFORM_PERSPECTIVE_MIN = 100;
const TRANSFORM_PERSPECTIVE_MAX = 3000;
const TRANSFORM_SCALE_STEP = 0.1;
const EFFECT_PREVIEW_BACKGROUND =
  'linear-gradient(180deg, rgba(255, 255, 255, 0.2), rgba(255, 255, 255, 0.08)), linear-gradient(135deg, rgba(86, 162, 255, 0.88), rgba(33, 91, 201, 0.92))';
const EFFECT_PREVIEW_SHADOW =
  '0 18px 30px rgba(0, 0, 0, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.28)';
const EFFECT_PREVIEW_HOVER_IDLE_MS = 1180;
const EFFECT_PREVIEW_CLICK_IDLE_MS = 1080;

@Component({
  selector: 'app-design-tab',
  standalone: true,
  imports: [
    CommonModule,
    ExtrasSectionComponent,
    DimensionsSectionComponent,
    LayoutSectionComponent,
    AppearanceSectionComponent,
    TypographySectionComponent,
    TransformsEffectsSectionComponent,
  ],
  templateUrl: './design-tab.component.html',
  styleUrl: './design-tab.component.css',
  encapsulation: ViewEncapsulation.None,
})
export class DesignTabComponent {
  readonly selectedElement = input<CanvasElement | null>(null);
  readonly projectId = input<number | null>(null);
  readonly autoOpenFillPopupElementId = input<string | null>(null);
  readonly pages = input<readonly CanvasPageModel[]>([]);
  readonly currentPageId = input<string | null>(null);
  readonly currentTool = input<CanvasElementType | 'select'>('select');

  readonly elementPatch = output<Partial<CanvasElement>>();
  readonly numberInputGestureStarted = output<void>();
  readonly numberInputGestureCommitted = output<void>();
  readonly frameTemplateSelected = output<FrameTemplateSelection>();

  transformMenuItems: ContextMenuItem[] = [];
  transformMenuX = 0;
  transformMenuY = 0;
  effectMenuItems: ContextMenuItem[] = [];
  effectMenuX = 0;
  effectMenuY = 0;
  dimensionMenuItems: ContextMenuItem[] = [];
  dimensionMenuX = 0;
  dimensionMenuY = 0;
  accessibilityMenuItems: ContextMenuItem[] = [];
  accessibilityMenuX = 0;
  accessibilityMenuY = 0;
  private readonly effectPopupViews = new Map<number, EffectPopupView>();
  private readonly effectPreviewVersions = new Map<number, number>();
  private readonly paddingModeOverrides = new Map<string, PaddingMode>();
  private readonly paddingLinkedValues = new Map<string, number>();
  private readonly accessibilityFieldOverrides = new Map<string, Set<AccessibilityField>>();
  private readonly imageDimensionsCache = new Map<
    string,
    Promise<{ width: number; height: number } | null>
  >();

  readonly borderStyleOptions = ['Solid', 'Dashed', 'Dotted', 'Double'];
  readonly fontFamilyOptions: DropdownSelectOption[] = [
    { label: 'Inter', value: 'Inter' },
    { label: 'Poppins', value: 'Poppins' },
    { label: 'Montserrat', value: 'Montserrat' },
    { label: 'Space Grotesk', value: 'Space Grotesk' },
    { label: 'Georgia', value: 'Georgia' },
    { label: 'Arial', value: 'Arial' },
  ];
  readonly fontWeightOptions: DropdownSelectOption[] = [
    { label: 'Light', value: 300 },
    { label: 'Regular', value: 400 },
    { label: 'Medium', value: 500 },
    { label: 'Semibold', value: 600 },
    { label: 'Bold', value: 700 },
  ];
  readonly fontSizeUnitOptions: DropdownSelectOption[] = [
    { label: 'Px', value: 'px' },
    { label: 'Rem', value: 'rem' },
  ];
  readonly textSpacingUnitOptions: DropdownSelectOption[] = [
    { label: 'Px', value: 'px' },
    { label: 'Em', value: 'em' },
  ];
  readonly textAlignToggleOptions: readonly ToggleGroupOption[] = [
    {
      label: '',
      value: 'left',
      icon: 'text-align-left',
      ariaLabel: 'Align text left',
      title: 'Left',
    },
    {
      label: '',
      value: 'center',
      icon: 'text-align-center',
      ariaLabel: 'Align text center',
      title: 'Center',
    },
    {
      label: '',
      value: 'right',
      icon: 'text-align-right',
      ariaLabel: 'Align text right',
      title: 'Right',
    },
    {
      label: '',
      value: 'justify',
      icon: 'text-align-justify',
      ariaLabel: 'Justify text',
      title: 'Justify',
    },
  ];
  readonly linkTypeOptions: readonly ToggleGroupOption[] = [
    { label: 'Page', value: 'page' },
    { label: 'URL', value: 'url' },
  ];
  readonly transformOptionDefinitions = TRANSFORM_OPTION_DEFINITIONS;
  readonly rotateModeOptions: readonly ToggleGroupOption[] = [
    { label: '2D', value: '2d' },
    { label: '3D', value: '3d' },
  ];
  readonly backfaceVisibilityOptions: readonly ToggleGroupOption[] = [
    { label: 'Visible', value: 'visible' },
    { label: 'Hidden', value: 'hidden' },
  ];
  readonly preserve3DOptions: readonly ToggleGroupOption[] = [
    { label: 'Yes', value: true },
    { label: 'No', value: false },
  ];
  readonly overflowOptions: DropdownSelectOption[] = [
    { label: 'Clip', value: 'clip' },
    { label: 'Visible', value: 'visible' },
    { label: 'Hidden', value: 'hidden' },
    { label: 'Scroll', value: 'scroll' },
  ];
  readonly shadowActivationPatch: Partial<CanvasElement> = {
    shadow: buildCanvasShadowCss(DEFAULT_EDITABLE_CANVAS_SHADOW),
  };
  readonly shadowClearPatch: Partial<CanvasElement> = { shadow: undefined };
  readonly visibleOptions: readonly ToggleGroupOption[] = [
    { label: 'Yes', value: true },
    { label: 'No', value: false },
  ];
  readonly cornerRadiusModeOptions: readonly ToggleGroupOption[] = [
    {
      label: '',
      value: 'full',
      icon: 'radius-full',
      ariaLabel: 'Use full corner radius',
      title: 'Full radius',
    },
    {
      label: '',
      value: 'per-corner',
      icon: 'radius-corners',
      ariaLabel: 'Use per-corner radius',
      title: 'Per-corner radius',
    },
  ];
  readonly cornerRadiusFields = CORNER_RADIUS_FIELD_DEFINITIONS;
  readonly paddingModeOptions: readonly ToggleGroupOption[] = [
    {
      label: '',
      value: 'full',
      icon: 'spacing-all',
      ariaLabel: 'Use uniform padding',
      title: 'Uniform padding',
    },
    {
      label: '',
      value: 'per-side',
      icon: 'spacing-sides',
      ariaLabel: 'Use per-side padding',
      title: 'Per-side padding',
    },
  ];
  readonly paddingFields = PADDING_FIELD_DEFINITIONS;
  readonly wrapOptions: readonly ToggleGroupOption[] = [
    { label: 'Yes', value: true },
    { label: 'No', value: false },
  ];
  readonly layoutDirectionOptions: readonly ToggleGroupOption[] = [
    {
      label: '',
      value: 'row',
      icon: 'direction-horizontal',
      ariaLabel: 'Horizontal layout direction',
      title: 'Distribute',
    },
    {
      label: '',
      value: 'column',
      icon: 'direction-vertical',
      ariaLabel: 'Vertical layout direction',
      title: 'Align',
    },
  ];
  readonly layoutDisplayOptions: readonly ToggleGroupOption[] = [
    { label: 'Flex', value: 'flex' },
    { label: 'Grid', value: 'grid' },
  ];
  readonly justifyContentOptions: DropdownSelectOption[] = [
    { label: 'Start', value: 'flex-start' },
    { label: 'End', value: 'flex-end' },
    { label: 'Center', value: 'center' },
    { label: 'Space Between', value: 'space-between' },
    { label: 'Space Around', value: 'space-around' },
    { label: 'Space Evenly', value: 'space-evenly' },
  ];
  readonly alignItemsHorizontalOptions: readonly ToggleGroupOption[] = [
    {
      label: '',
      value: 'flex-start',
      icon: 'align-horizontal-start',
      ariaLabel: 'Align start',
      title: 'Start',
    },
    {
      label: '',
      value: 'center',
      icon: 'align-horizontal-center',
      ariaLabel: 'Align center',
      title: 'Center',
    },
    {
      label: '',
      value: 'flex-end',
      icon: 'align-horizontal-end',
      ariaLabel: 'Align end',
      title: 'End',
    },
  ];
  readonly alignItemsVerticalOptions: readonly ToggleGroupOption[] = [
    {
      label: '',
      value: 'flex-start',
      icon: 'align-vertical-start',
      ariaLabel: 'Align start',
      title: 'Start',
    },
    {
      label: '',
      value: 'center',
      icon: 'align-vertical-center',
      ariaLabel: 'Align center',
      title: 'Center',
    },
    {
      label: '',
      value: 'flex-end',
      icon: 'align-vertical-end',
      ariaLabel: 'Align end',
      title: 'End',
    },
  ];
  readonly positionOptions: DropdownSelectOption[] = [
    { label: 'Static', value: 'static' },
    { label: 'Relative', value: 'relative' },
    { label: 'Absolute', value: 'absolute' },
    { label: 'Fixed', value: 'fixed' },
    { label: 'Sticky', value: 'sticky' },
  ];
  readonly cursorOptions: DropdownSelectOption[] = [
    { label: 'Auto (inherit)', value: 'auto' },
    { label: 'Default', value: 'default' },
    { label: 'Pointer', value: 'pointer' },
    { label: 'Text', value: 'text' },
    { label: 'Move', value: 'move' },
    { label: 'Grab', value: 'grab' },
    { label: 'Grabbing', value: 'grabbing' },
    { label: 'Not Allowed', value: 'not-allowed' },
    { label: 'Wait', value: 'wait' },
    { label: 'Progress', value: 'progress' },
    { label: 'Crosshair', value: 'crosshair' },
    { label: 'Zoom In', value: 'zoom-in' },
    { label: 'Zoom Out', value: 'zoom-out' },
    { label: 'Help', value: 'help' },
    { label: 'N/S Resize', value: 'ns-resize' },
    { label: 'E/W Resize', value: 'ew-resize' },
    { label: 'Col Resize', value: 'col-resize' },
    { label: 'Row Resize', value: 'row-resize' },
    { label: 'None', value: 'none' },
  ];

  readonly effectPresetOptions: DropdownSelectOption[] = [
    { label: 'Custom', value: 'custom' },
    { label: 'Fade In', value: 'fadeIn' },
    { label: 'Scale In', value: 'scaleIn' },
    { label: 'Scale In Bottom', value: 'scaleInBottom' },
    { label: 'Flip Horizontal', value: 'flipHorizontal' },
    { label: 'Flip Vertical', value: 'flipVertical' },
    { label: 'Slide In Top', value: 'slideInTop' },
    { label: 'Slide In Left', value: 'slideInLeft' },
    { label: 'Slide In Right', value: 'slideInRight' },
    { label: 'Slide In Bottom', value: 'slideInBottom' },
  ];

  readonly effectTriggerOptions: DropdownSelectOption[] = [
    { label: 'On Load', value: 'onLoad' },
    { label: 'Hover', value: 'hover' },
    { label: 'Click / Tap', value: 'click' },
    { label: 'Loop', value: 'loop' },
  ];

  readonly effectEasingOptions: DropdownSelectOption[] = [
    { label: 'Ease', value: 'ease' },
    { label: 'Ease In', value: 'ease-in' },
    { label: 'Ease Out', value: 'ease-out' },
    { label: 'Ease In Out', value: 'ease-in-out' },
    { label: 'Linear', value: 'linear' },
  ];
  readonly effectLoopTypeOptions: readonly ToggleGroupOption[] = [
    { label: 'Loop', value: 'loop' },
    { label: 'Mirror', value: 'mirror' },
  ];
  readonly effectOffScreenOptions: readonly ToggleGroupOption[] = [
    { label: 'Play', value: 'play' },
    { label: 'Pause', value: 'pause' },
  ];
  readonly dimensionModeDefinitions = DIMENSION_MODE_DEFINITIONS;
  readonly dimensionConstraintModeDefinitions = DIMENSION_CONSTRAINT_MODE_DEFINITIONS;

  readonly frameTemplates: FrameTemplateSelection[] = [
    {
      name: 'iPhone',
      sizeLabel: '390 × 844',
      width: 390,
      height: 844,
    },
    {
      name: 'Tablet',
      sizeLabel: '820 × 1180',
      width: 820,
      height: 1180,
    },
    {
      name: 'Desktop',
      sizeLabel: '1440 × 900',
      width: 1440,
      height: 900,
    },
  ];

  private readonly defaultFillColor = '#e0e0e0';
  private readonly defaultFrameFillColor = '#3f3f46';
  private readonly defaultStrokeColor = '#52525b';

  toDisplayInt(value: number | undefined): string {
    if (!Number.isFinite(value ?? Number.NaN)) {
      return '';
    }

    return Math.round(value as number).toString();
  }

  hasFill(type: CanvasElementType): boolean {
    return type !== 'text' && type !== 'image';
  }

  hasTransforms(element: CanvasElement): boolean {
    return this.activeTransformOptions(element).length > 0;
  }

  isTransformOptionAdded(element: CanvasElement, option: CanvasTransformOption): boolean {
    return this.activeTransformOptions(element).includes(option);
  }

  onLinkSectionHeaderClick(): void {
    const element = this.selectedElement();
    if (!element) {
      return;
    }

    if (this.hasLink(element)) {
      this.removeLink();
      return;
    }

    this.addLink();
  }

  onLinkSectionToggleClick(event: MouseEvent): void {
    event.stopPropagation();
    this.onLinkSectionHeaderClick();
  }

  onLayoutSectionHeaderClick(): void {
    const element = this.selectedElement();
    if (!element) {
      return;
    }

    if (this.hasLayout(element)) {
      this.removeLayout();
      return;
    }

    this.addLayout();
  }

  onLayoutSectionToggleClick(event: MouseEvent): void {
    event.stopPropagation();
    this.onLayoutSectionHeaderClick();
  }

  onTransformSectionHeaderClick(event: MouseEvent): void {
    this.openTransformMenu(event, this.resolveSectionHeaderTrigger(event));
  }

  onTransformSectionToggleClick(event: MouseEvent): void {
    event.stopPropagation();
    this.onTransformSectionHeaderClick(event);
  }

  onDimensionSectionHeaderClick(event: MouseEvent): void {
    this.openDimensionMenu(event, this.resolveSectionHeaderTrigger(event));
  }

  onDimensionSectionToggleClick(event: MouseEvent): void {
    event.stopPropagation();
    this.onDimensionSectionHeaderClick(event);
  }

  onAccessibilitySectionHeaderClick(event: MouseEvent): void {
    this.openAccessibilityMenu(event, this.resolveSectionHeaderTrigger(event));
  }

  onAccessibilitySectionToggleClick(event: MouseEvent): void {
    event.stopPropagation();
    this.onAccessibilitySectionHeaderClick(event);
  }

  private openTransformMenu(event: MouseEvent | null, trigger: HTMLElement | null): void {
    const element = this.selectedElement();
    const position = this.resolveTransformMenuPosition(event, trigger);
    if (!element || !position) {
      return;
    }

    this.closeEffectMenu();
    this.closeDimensionMenu();
    this.closeAccessibilityMenu();

    if (this.transformMenuItems.length > 0) {
      return;
    }

    this.transformMenuItems = this.buildTransformMenuItems(element);
    this.transformMenuX = position.x;
    this.transformMenuY = position.y;
  }

  private openAccessibilityMenu(event: MouseEvent | null, trigger: HTMLElement | null): void {
    const element = this.selectedElement();
    const position = this.resolveTransformMenuPosition(event, trigger);
    if (!element || !position) {
      return;
    }

    this.closeTransformMenu();
    this.closeEffectMenu();
    this.closeDimensionMenu();

    if (this.accessibilityMenuItems.length > 0) {
      return;
    }

    this.accessibilityMenuItems = this.buildAccessibilityMenuItems(element);
    this.accessibilityMenuX = position.x;
    this.accessibilityMenuY = position.y;
  }

  private openDimensionMenu(event: MouseEvent | null, trigger: HTMLElement | null): void {
    const element = this.selectedElement();
    const position = this.resolveTransformMenuPosition(event, trigger);
    if (!element || !position) {
      return;
    }

    this.closeTransformMenu();
    this.closeEffectMenu();
    this.closeAccessibilityMenu();

    if (this.dimensionMenuItems.length > 0) {
      return;
    }

    this.dimensionMenuItems = this.buildDimensionMenuItems(element);
    this.dimensionMenuX = position.x;
    this.dimensionMenuY = position.y;
  }

  private resolveTransformMenuPosition(
    event: MouseEvent | null,
    trigger: HTMLElement | null,
  ): { x: number; y: number } | null {
    if (event && Number.isFinite(event.clientX) && Number.isFinite(event.clientY)) {
      return {
        x: event.clientX,
        y: event.clientY,
      };
    }

    if (!trigger) {
      return null;
    }

    const rect = trigger.getBoundingClientRect();
    return {
      x: rect.left,
      y: rect.top - 6,
    };
  }

  private resolveSectionHeaderTrigger(event: MouseEvent): HTMLElement | null {
    const currentTarget = event.currentTarget;
    if (!(currentTarget instanceof HTMLElement)) {
      return null;
    }

    return (
      (currentTarget.closest('.properties-section-header') as HTMLElement | null) ??
      (currentTarget.querySelector('.properties-section-header') as HTMLElement | null)
    );
  }

  closeTransformMenu(): void {
    this.transformMenuItems = [];
  }

  closeEffectMenu(): void {
    this.effectMenuItems = [];
  }

  closeDimensionMenu(): void {
    this.dimensionMenuItems = [];
  }

  closeAccessibilityMenu(): void {
    this.accessibilityMenuItems = [];
  }

  hasStroke(type: CanvasElementType): boolean {
    return type !== 'text';
  }

  supportsCornerRadius(type: CanvasElementType): boolean {
    return type !== 'text';
  }

  cornerRadiusMode(element: CanvasElement): CornerRadiusMode {
    return hasPerCornerRadius(element) ? 'per-corner' : 'full';
  }

  fullCornerRadiusInputValue(element: CanvasElement): number | null {
    return this.cornerRadiusMode(element) === 'per-corner'
      ? null
      : this.uniformCornerRadiusValue(element);
  }

  uniformCornerRadiusValue(element: CanvasElement): number {
    return getDefaultCornerRadius(element);
  }

  cornerRadiusValue(element: CanvasElement, corner: keyof CanvasCornerRadii): number {
    return getResolvedCornerRadii(element)[corner];
  }

  paddingMode(element: CanvasElement): PaddingMode {
    return (
      this.paddingModeOverrides.get(element.id) ??
      (this.hasPerSidePadding(element) ? 'per-side' : 'full')
    );
  }

  fullPaddingInputValue(element: CanvasElement): number | null {
    return this.paddingMode(element) === 'per-side' ? null : this.uniformPaddingValue(element);
  }

  uniformPaddingValue(element: CanvasElement): number {
    const padding = this.getSpacingValues(element, 'padding');
    if (!this.hasPerSidePadding(element)) {
      return padding.top;
    }

    return this.paddingLinkedValues.get(element.id) ?? padding.top;
  }

  onCornerRadiusModeChange(value: string | number | boolean | null): void {
    if (value !== 'full' && value !== 'per-corner') {
      return;
    }

    const element = this.selectedElement();
    if (!element) {
      return;
    }

    if (value === 'per-corner') {
      this.emitPatch({
        cornerRadius: this.uniformCornerRadiusValue(element),
        cornerRadii: getResolvedCornerRadii(element),
      });
      return;
    }

    this.emitPatch({
      cornerRadius: this.uniformCornerRadiusValue(element),
      cornerRadii: undefined,
    });
  }

  onCornerRadiusCornerChange(corner: keyof CanvasCornerRadii, value: number): void {
    if (!Number.isFinite(value)) {
      return;
    }

    const element = this.selectedElement();
    if (!element) {
      return;
    }

    const nextRadii = {
      ...getResolvedCornerRadii(element),
      [corner]: Math.max(0, roundToTwoDecimals(value)),
    } satisfies CanvasCornerRadii;

    this.emitPatch({ cornerRadii: nextRadii });
  }

  onPaddingModeChange(value: string | number | boolean | null): void {
    if (value !== 'full' && value !== 'per-side') {
      return;
    }

    const element = this.selectedElement();
    if (!element) {
      return;
    }

    const currentPadding = this.getSpacingValues(element, 'padding');
    const linkedValue = this.uniformPaddingValue(element);

    this.paddingModeOverrides.set(element.id, value);
    this.paddingLinkedValues.set(element.id, linkedValue);

    if (value === 'per-side') {
      this.emitPatch({ padding: currentPadding });
      return;
    }

    const nextValue = Math.max(0, roundToTwoDecimals(linkedValue));
    this.emitPatch({
      padding: {
        top: nextValue,
        right: nextValue,
        bottom: nextValue,
        left: nextValue,
      },
    });
  }

  onPaddingFullChange(value: number): void {
    if (!Number.isFinite(value)) {
      return;
    }

    const element = this.selectedElement();
    if (!element) {
      return;
    }

    const nextValue = Math.max(0, roundToTwoDecimals(value));
    this.paddingModeOverrides.set(element.id, 'full');
    this.paddingLinkedValues.set(element.id, nextValue);
    this.emitPatch({
      padding: {
        top: nextValue,
        right: nextValue,
        bottom: nextValue,
        left: nextValue,
      },
    });
  }

  onPaddingSideChange(side: keyof CanvasSpacing, value: number): void {
    if (!Number.isFinite(value)) {
      return;
    }

    const element = this.selectedElement();
    if (!element) {
      return;
    }

    const currentPadding = this.getSpacingValues(element, 'padding');
    this.paddingModeOverrides.set(element.id, 'per-side');
    this.emitPatch({
      padding: {
        ...currentPadding,
        [side]: Math.max(0, roundToTwoDecimals(value)),
      },
    });
  }

  isFrame(type: CanvasElementType): boolean {
    return type === 'frame';
  }

  isFrameToolSelected(): boolean {
    return this.currentTool() === 'frame';
  }

  isText(type: CanvasElementType): boolean {
    return type === 'text';
  }

  isImage(type: CanvasElementType): boolean {
    return type === 'image';
  }

  supportsOverflow(type: CanvasElementType): boolean {
    return type === 'frame' || type === 'rectangle';
  }

  supportsShadow(type: CanvasElementType): boolean {
    return type !== 'text';
  }

  onNumberChange(field: EditableNumericField, valueOrEvent: number | Event): void {
    const value =
      typeof valueOrEvent === 'number'
        ? valueOrEvent
        : Number((valueOrEvent.target as HTMLInputElement).value);

    if (!Number.isFinite(value)) {
      return;
    }

    const element = this.selectedElement();
    if (field === 'cornerRadius' && element && this.cornerRadiusMode(element) === 'per-corner') {
      this.emitPatch({
        cornerRadius: Math.max(0, roundToTwoDecimals(value)),
        cornerRadii: undefined,
      });
      return;
    }

    this.emitPatch({ [field]: value } as Partial<CanvasElement>);
  }

  dimensionModeValue(element: CanvasElement, axis: CanvasSizeAxis): CanvasSizeMode {
    return normalizeCanvasSizeMode(
      getCanvasSizeMode(element, axis),
      element,
      this.parentElement(element),
    );
  }

  dimensionModeOptions(element: CanvasElement, axis: CanvasSizeAxis): DropdownSelectOption[] {
    const parent = this.parentElement(element);
    return this.dimensionModeDefinitions.map((definition) => ({
      label: definition.label,
      triggerLabel: this.getDimensionModeTriggerLabel(definition.mode),
      value: definition.mode,
      disabled: !supportsCanvasSizeMode(definition.mode, element, parent),
    }));
  }

  dimensionInputValue(element: CanvasElement, axis: CanvasSizeAxis): number {
    const mode = this.dimensionModeValue(element, axis);
    const parent = this.parentElement(element);
    const page = this.currentPageModel();
    const fixedPixels = getCanvasFixedSize(element, axis);
    const sizingValue = getCanvasSizingValue(element, axis);

    if (mode === 'fixed' || mode === 'fit-content' || mode === 'fit-image') {
      return fixedPixels;
    }

    if (mode === 'fill') {
      return 100;
    }

    return (
      sizingValue ?? deriveCanvasSizeValueFromPixels(mode, fixedPixels, axis, parent, page) ?? 100
    );
  }

  dimensionInputSuffix(element: CanvasElement, axis: CanvasSizeAxis): string | null {
    return getCanvasSizeSuffix(this.dimensionModeValue(element, axis), axis);
  }

  isDimensionInputDisabled(element: CanvasElement, axis: CanvasSizeAxis): boolean {
    return shouldDisableCanvasSizeInput(this.dimensionModeValue(element, axis));
  }

  onDimensionValueChange(axis: CanvasSizeAxis, value: number): void {
    if (!Number.isFinite(value)) {
      return;
    }

    const element = this.selectedElement();
    if (!element) {
      return;
    }

    const mode = this.dimensionModeValue(element, axis);
    if (shouldDisableCanvasSizeInput(mode)) {
      return;
    }

    const parent = this.parentElement(element);
    const page = this.currentPageModel();
    const normalizedValue = Math.max(1, roundToTwoDecimals(value));
    const nextPixels =
      mode === 'fixed'
        ? normalizedValue
        : resolveCanvasPixelsFromMode(
            mode,
            getCanvasFixedSize(element, axis),
            axis,
            normalizedValue,
            parent,
            page,
          );

    this.emitPatch(
      mode === 'fixed'
        ? ({ [axis]: nextPixels } as Partial<CanvasElement>)
        : ({
            [axis]: nextPixels,
            [getCanvasSizeValueField(axis)]: normalizeCanvasSizeValue(mode, normalizedValue),
          } as Partial<CanvasElement>),
    );

    this.syncFitImageAxisFromOpposite(axis, element, nextPixels);
  }

  onDimensionModeChange(axis: CanvasSizeAxis, value: string | number | boolean | null): void {
    if (typeof value !== 'string') {
      return;
    }

    const element = this.selectedElement();
    if (!element) {
      return;
    }

    const parent = this.parentElement(element);
    const nextMode = normalizeCanvasSizeMode(value, element, parent);

    if (nextMode === 'fit-image') {
      void this.applyFitImageSize(axis, element);
      return;
    }

    const currentMode = this.dimensionModeValue(element, axis);
    if (nextMode === currentMode) {
      return;
    }

    const page = this.currentPageModel();
    const fixedPixels = getCanvasFixedSize(element, axis);
    const nextSizingValue =
      nextMode === 'fixed' || nextMode === 'fit-content'
        ? undefined
        : nextMode === 'fill'
          ? 100
          : (deriveCanvasSizeValueFromPixels(nextMode, fixedPixels, axis, parent, page) ?? 100);

    this.emitPatch({
      [axis]: resolveCanvasPixelsFromMode(
        nextMode,
        fixedPixels,
        axis,
        nextSizingValue,
        parent,
        page,
      ),
      [getCanvasSizeModeField(axis)]: nextMode === 'fixed' ? undefined : nextMode,
      [getCanvasSizeValueField(axis)]: normalizeCanvasSizeValue(nextMode, nextSizingValue),
    } as Partial<CanvasElement>);
  }

  hasDimensionConstraintField(element: CanvasElement, field: DimensionConstraintField): boolean {
    return Number.isFinite(getCanvasConstraintValue(element, field) ?? Number.NaN);
  }

  dimensionConstraintModeValue(
    element: CanvasElement,
    field: DimensionConstraintField,
  ): CanvasConstraintSizeMode {
    return normalizeCanvasConstraintMode(
      getCanvasConstraintMode(element, field),
      element,
      this.parentElement(element),
    );
  }

  dimensionConstraintModeOptions(
    element: CanvasElement,
    field: DimensionConstraintField,
  ): DropdownSelectOption[] {
    const parent = this.parentElement(element);
    return this.dimensionConstraintModeDefinitions.map((definition) => ({
      label: definition.label,
      triggerLabel: this.getDimensionModeTriggerLabel(definition.mode),
      value: definition.mode,
      disabled: !supportsCanvasConstraintSizeMode(definition.mode, element, parent),
    }));
  }

  private getDimensionModeTriggerLabel(mode: CanvasSizeMode | CanvasConstraintSizeMode): string {
    switch (mode) {
      case 'fixed':
        return 'Fixed';
      case 'relative':
        return 'Rel';
      case 'fill':
        return 'Fill';
      case 'fit-content':
        return 'Fit';
      case 'viewport':
        return 'View';
      case 'fit-image':
        return 'Fit Img';
      default:
        return 'Fixed';
    }
  }

  private supportsFitImageSizeMode(element: CanvasElement): boolean {
    return element.fillMode === 'image' && !!element.backgroundImage;
  }

  private async applyFitImageSize(axis: CanvasSizeAxis, element: CanvasElement): Promise<void> {
    if (!this.supportsFitImageSizeMode(element) || !element.backgroundImage) {
      return;
    }

    const dimensions = await this.loadImageDimensions(element.backgroundImage);
    if (!dimensions || dimensions.width <= 0 || dimensions.height <= 0) {
      return;
    }

    const aspectRatio = dimensions.width / dimensions.height;
    if (!Number.isFinite(aspectRatio) || aspectRatio <= 0) {
      return;
    }

    const oppositeAxis: CanvasSizeAxis = axis === 'width' ? 'height' : 'width';
    const currentOppositeMode = this.dimensionModeValue(element, oppositeAxis);
    const patch: Partial<CanvasElement> = {
      [getCanvasSizeModeField(axis)]: 'fit-image',
      [getCanvasSizeValueField(axis)]: undefined,
    } as Partial<CanvasElement>;

    if (currentOppositeMode === 'fit-image') {
      patch[getCanvasSizeModeField(oppositeAxis)] = undefined;
      patch[getCanvasSizeValueField(oppositeAxis)] = undefined;
    }

    if (axis === 'width') {
      patch.width = Math.max(1, roundToTwoDecimals(element.height * aspectRatio));
    } else {
      patch.height = Math.max(1, roundToTwoDecimals(element.width / aspectRatio));
    }

    this.emitPatch(patch);
  }

  private syncFitImageAxisFromOpposite(
    changedAxis: CanvasSizeAxis,
    element: CanvasElement,
    changedAxisPixels: number,
  ): void {
    const dependentAxis: CanvasSizeAxis = changedAxis === 'width' ? 'height' : 'width';
    if (
      this.dimensionModeValue(element, dependentAxis) !== 'fit-image' ||
      !element.backgroundImage
    ) {
      return;
    }

    void this.applyFitImageSizeFromPixels(
      dependentAxis,
      element.backgroundImage,
      changedAxisPixels,
    );
  }

  private async applyFitImageSizeFromPixels(
    axis: CanvasSizeAxis,
    imageUrl: string,
    oppositeAxisPixels: number,
  ): Promise<void> {
    const dimensions = await this.loadImageDimensions(imageUrl);
    if (!dimensions || dimensions.width <= 0 || dimensions.height <= 0) {
      return;
    }

    const aspectRatio = dimensions.width / dimensions.height;
    if (!Number.isFinite(aspectRatio) || aspectRatio <= 0) {
      return;
    }

    const patch: Partial<CanvasElement> = {
      [getCanvasSizeValueField(axis)]: undefined,
    } as Partial<CanvasElement>;

    if (axis === 'width') {
      patch.width = Math.max(1, roundToTwoDecimals(oppositeAxisPixels * aspectRatio));
    } else {
      patch.height = Math.max(1, roundToTwoDecimals(oppositeAxisPixels / aspectRatio));
    }

    this.emitPatch(patch);
  }

  private loadImageDimensions(imageUrl: string): Promise<{ width: number; height: number } | null> {
    const cached = this.imageDimensionsCache.get(imageUrl);
    if (cached) {
      return cached;
    }

    const promise = new Promise<{ width: number; height: number } | null>((resolve) => {
      const image = new Image();
      image.decoding = 'async';
      image.onload = () => {
        resolve(
          image.naturalWidth > 0 && image.naturalHeight > 0
            ? {
                width: image.naturalWidth,
                height: image.naturalHeight,
              }
            : null,
        );
      };
      image.onerror = () => {
        this.imageDimensionsCache.delete(imageUrl);
        resolve(null);
      };
      image.src = imageUrl;
    });

    this.imageDimensionsCache.set(imageUrl, promise);
    return promise;
  }

  dimensionConstraintInputValue(element: CanvasElement, field: DimensionConstraintField): number {
    const pixels = getCanvasConstraintValue(element, field);
    const mode = this.dimensionConstraintModeValue(element, field);
    if (!Number.isFinite(pixels ?? Number.NaN)) {
      return 0;
    }

    if (mode === 'fixed') {
      return pixels as number;
    }

    return (
      getCanvasConstraintSizingValue(element, field) ??
      deriveCanvasConstraintValueFromPixels(
        'relative',
        pixels as number,
        field === 'minWidth' || field === 'maxWidth' ? 'width' : 'height',
        this.parentElement(element),
      ) ??
      100
    );
  }

  dimensionConstraintInputSuffix(
    element: CanvasElement,
    field: DimensionConstraintField,
  ): string | null {
    return getCanvasConstraintSuffix(this.dimensionConstraintModeValue(element, field));
  }

  onDimensionConstraintValueChange(field: DimensionConstraintField, value: number): void {
    if (!Number.isFinite(value)) {
      return;
    }

    const element = this.selectedElement();
    if (!element) {
      return;
    }

    const mode = this.dimensionConstraintModeValue(element, field);
    const axis: CanvasSizeAxis = field === 'minWidth' || field === 'maxWidth' ? 'width' : 'height';
    const normalizedValue = Math.max(1, roundToTwoDecimals(value));

    if (mode === 'fixed') {
      this.emitPatch({
        [field]: normalizedValue,
        [getCanvasConstraintModeField(field)]: undefined,
        [getCanvasConstraintSizeValueField(field)]: undefined,
      } as Partial<CanvasElement>);
      return;
    }

    this.emitPatch({
      [field]: resolveCanvasConstraintPixels(
        mode,
        getCanvasConstraintValue(element, field) ?? normalizedValue,
        axis,
        normalizedValue,
        this.parentElement(element),
      ),
      [getCanvasConstraintSizeValueField(field)]: normalizeCanvasConstraintValue(
        mode,
        normalizedValue,
      ),
    } as Partial<CanvasElement>);
  }

  onDimensionConstraintModeChange(
    field: DimensionConstraintField,
    value: string | number | boolean | null,
  ): void {
    if (typeof value !== 'string') {
      return;
    }

    const element = this.selectedElement();
    if (!element) {
      return;
    }

    const parent = this.parentElement(element);
    const nextMode = normalizeCanvasConstraintMode(value, element, parent);
    const currentMode = this.dimensionConstraintModeValue(element, field);
    if (nextMode === currentMode) {
      return;
    }

    const currentPixels = getCanvasConstraintValue(element, field);
    if (!Number.isFinite(currentPixels ?? Number.NaN)) {
      return;
    }

    const axis: CanvasSizeAxis = field === 'minWidth' || field === 'maxWidth' ? 'width' : 'height';
    const nextSizingValue =
      nextMode === 'fixed'
        ? undefined
        : (deriveCanvasConstraintValueFromPixels(nextMode, currentPixels as number, axis, parent) ??
          100);

    this.emitPatch({
      [field]:
        nextMode === 'fixed'
          ? roundToTwoDecimals(currentPixels as number)
          : resolveCanvasConstraintPixels(
              nextMode,
              currentPixels as number,
              axis,
              nextSizingValue,
              parent,
            ),
      [getCanvasConstraintModeField(field)]: nextMode === 'fixed' ? undefined : nextMode,
      [getCanvasConstraintSizeValueField(field)]: normalizeCanvasConstraintValue(
        nextMode,
        nextSizingValue,
      ),
    } as Partial<CanvasElement>);
  }

  onNumberInputGestureStarted(): void {
    this.numberInputGestureStarted.emit();
  }

  onNumberInputGestureCommitted(): void {
    this.numberInputGestureCommitted.emit();
  }

  opacitySliderPercent(element: CanvasElement): string {
    const value = Number.isFinite(element.opacity ?? Number.NaN) ? (element.opacity as number) : 1;
    return `${Math.max(0, Math.min(100, Math.round(value * 100)))}%`;
  }

  onOverflowChange(value: string | number | boolean | null): void {
    if (typeof value !== 'string') {
      return;
    }

    const overflow = value as CanvasOverflowMode;
    this.emitPatch({ overflow });
  }

  onTypographySelectChange(
    field: EditableTypographyField,
    value: string | number | boolean | null,
  ): void {
    if (field === 'fontWeight') {
      if (typeof value !== 'number') {
        return;
      }

      this.emitPatch({ fontWeight: value });
      return;
    }

    if (typeof value !== 'string') {
      return;
    }

    this.emitPatch({ [field]: value } as Partial<CanvasElement>);
  }

  borderStyleValue(element: CanvasElement): string {
    return element.strokeStyle ?? 'Solid';
  }

  overflowValue(element: CanvasElement): CanvasOverflowMode {
    return element.overflow ?? 'clip';
  }

  shadowValue(element: CanvasElement): string | null {
    return normalizeCanvasShadowValue(element.shadow) ?? null;
  }

  isVisible(element: CanvasElement): boolean {
    return element.visible !== false;
  }

  hasActiveBorder(element: CanvasElement): boolean {
    if (!element.stroke) {
      return false;
    }

    if (element.strokeWidths) {
      return Object.values(element.strokeWidths).some((value) => value > 0);
    }

    return (element.strokeWidth ?? 1) > 0;
  }

  hasActiveShadow(element: CanvasElement): boolean {
    return hasCanvasShadow(element.shadow);
  }

  fillInputValue(element: CanvasElement): string {
    const fallback = element.type === 'frame' ? this.defaultFrameFillColor : this.defaultFillColor;
    return this.toHexColorOrFallback(element.fill, fallback);
  }

  fillPickerValue(element: CanvasElement): string {
    const fillValue = this.fillInputValue(element);
    if (fillValue !== 'transparent') {
      return fillValue;
    }

    return element.type === 'frame' ? this.defaultFrameFillColor : this.defaultFillColor;
  }

  strokeInputValue(element: CanvasElement): string {
    return this.toHexColorOrFallback(element.stroke, this.defaultStrokeColor);
  }

  strokeSidesValue(element: CanvasElement): CanvasBorderSides | null {
    if (element.strokeSides) {
      return element.strokeSides;
    }

    if (!element.strokeWidths) {
      return null;
    }

    return {
      top: element.strokeWidths.top > 0,
      right: element.strokeWidths.right > 0,
      bottom: element.strokeWidths.bottom > 0,
      left: element.strokeWidths.left > 0,
    };
  }

  strokeWidthsValue(element: CanvasElement): CanvasBorderWidths | null {
    return element.strokeWidths ?? null;
  }

  applyFrameTemplate(template: FrameTemplateSelection): void {
    this.frameTemplateSelected.emit(template);
  }

  onTextChange(field: 'text' | 'imageUrl', event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.emitPatch({ [field]: value } as Partial<CanvasElement>);
  }

  fontFamilyValue(element: CanvasElement): string {
    return element.fontFamily ?? 'Inter';
  }

  fontWeightValue(element: CanvasElement): number {
    return element.fontWeight ?? 400;
  }

  fontSizeUnitValue(element: CanvasElement): CanvasFontSizeUnit {
    return element.fontSizeUnit === 'rem' ? 'rem' : 'px';
  }

  fontStyleValue(element: CanvasElement): CanvasFontStyle {
    return element.fontStyle ?? 'normal';
  }

  letterSpacingUnitValue(element: CanvasElement): CanvasTextSpacingUnit {
    return element.letterSpacingUnit === 'em' ? 'em' : 'px';
  }

  lineHeightUnitValue(element: CanvasElement): CanvasTextSpacingUnit {
    return element.lineHeightUnit === 'px' ? 'px' : 'em';
  }

  textAlignValue(element: CanvasElement): CanvasTextAlign {
    return element.textAlign ?? 'center';
  }

  textVerticalAlignValue(element: CanvasElement): CanvasTextVerticalAlign {
    return element.textVerticalAlign ?? 'middle';
  }

  transformScaleValue(element: CanvasElement): number {
    const scaleX = Math.abs(element.scaleX ?? 1);
    const scaleY = Math.abs(element.scaleY ?? 1);
    return roundToTwoDecimals(Math.max(scaleX, scaleY));
  }

  rotationValue(element: CanvasElement): number {
    return element.rotation ?? 0;
  }

  rotationModeValue(element: CanvasElement): CanvasRotationMode {
    return element.rotationMode === '3d' ? '3d' : '2d';
  }

  skewXValue(element: CanvasElement): number {
    return element.skewX ?? 0;
  }

  skewYValue(element: CanvasElement): number {
    return element.skewY ?? 0;
  }

  depthValue(element: CanvasElement): number {
    return element.depth ?? 0;
  }

  perspectiveValue(element: CanvasElement): number {
    return element.perspective ?? 1200;
  }

  originXValue(element: CanvasElement): number {
    return element.transformOriginX ?? 50;
  }

  originYValue(element: CanvasElement): number {
    return element.transformOriginY ?? 50;
  }

  backfaceVisibilityValue(element: CanvasElement): CanvasBackfaceVisibility {
    return element.backfaceVisibility === 'hidden' ? 'hidden' : 'visible';
  }

  preserve3DValue(element: CanvasElement): boolean {
    return element.preserve3D ?? true;
  }

  transformSliderPercent(value: number, min: number, max: number): string {
    const clamped = Math.max(min, Math.min(max, value));
    const ratio = (clamped - min) / Math.max(max - min, 1);
    return `${Math.round(ratio * 100)}%`;
  }

  hasLink(element: CanvasElement): boolean {
    return hasCanvasElementLink(element);
  }

  linkTypeValue(element: CanvasElement): CanvasLinkType {
    return element.linkType === 'page' ? 'page' : 'url';
  }

  linkPageOptions(element: CanvasElement): DropdownSelectOption[] {
    const selectedPageId =
      element.linkType === 'page' && typeof element.linkPageId === 'string'
        ? element.linkPageId
        : null;

    return this.pages()
      .filter((page) => page.id !== this.currentPageId() || page.id === selectedPageId)
      .map((page) => ({
        label: page.id === this.currentPageId() ? `${page.name} (current)` : page.name,
        value: page.id,
      }));
  }

  linkPageValue(element: CanvasElement): string | null {
    if (element.linkType !== 'page') {
      return null;
    }

    return typeof element.linkPageId === 'string' && element.linkPageId.trim().length > 0
      ? element.linkPageId
      : null;
  }

  linkUrlValue(element: CanvasElement): string {
    return element.linkType === 'url' ? (element.linkUrl ?? '') : '';
  }

  fillLabel(element: CanvasElement): string {
    if (element.fillMode === 'image') {
      return 'Image';
    }

    const value = this.fillInputValue(element);
    return value === 'transparent' ? 'Transparent' : preserveColorDisplayValue(value);
  }

  borderSummary(element: CanvasElement): string {
    return this.borderStyleValue(element);
  }

  shadowSummary(element: CanvasElement): string {
    if (!hasCanvasShadow(element.shadow)) {
      return 'None';
    }

    const shadow = resolveEditableCanvasShadow(element.shadow);
    return `${this.formatShadowMetric(shadow.x)}, ${this.formatShadowMetric(shadow.y)}, ${this.formatShadowMetric(shadow.spread)}`;
  }

  isTransparentFill(element: CanvasElement): boolean {
    if (element.fillMode === 'image') {
      return false;
    }

    return isTransparentColor(this.fillInputValue(element));
  }

  fillSwatchBackground(element: CanvasElement): string | null {
    if (element.fillMode === 'image' && element.backgroundImage) {
      return `url(${element.backgroundImage}) center/cover no-repeat`;
    }

    const value = this.fillInputValue(element);
    return value === 'transparent' ? null : value;
  }

  strokeSwatchBackground(element: CanvasElement): string {
    return this.strokeInputValue(element);
  }

  private formatShadowMetric(value: number): string {
    return roundToTwoDecimals(value).toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  }

  setVisible(visible: boolean): void {
    this.emitPatch({ visible });
  }

  supportsLayout(type: CanvasElementType): boolean {
    return type === 'frame' || type === 'rectangle';
  }

  hasLayout(element: CanvasElement): boolean {
    return !!element.display;
  }

  supportsPosition(type: CanvasElementType): boolean {
    return type !== 'frame';
  }

  isFlex(element: CanvasElement): boolean {
    return this.displayValue(element) === 'flex';
  }

  isGrid(element: CanvasElement): boolean {
    return this.displayValue(element) === 'grid';
  }

  displayValue(element: CanvasElement): 'flex' | 'grid' {
    return element.display === 'grid' ? 'grid' : 'flex';
  }

  positionValue(element: CanvasElement): CanvasPositionMode {
    return element.position ?? 'static';
  }

  hasCursor(element: CanvasElement): boolean {
    return !!element.cursor;
  }

  onCursorSectionHeaderClick(): void {
    const element = this.selectedElement();
    if (!element) {
      return;
    }

    if (this.hasCursor(element)) {
      this.removeCursor();
      return;
    }

    this.addCursor();
  }

  onCursorSectionToggleClick(event: MouseEvent): void {
    event.stopPropagation();
    this.onCursorSectionHeaderClick();
  }

  addCursor(): void {
    this.emitPatch({ cursor: 'pointer' });
  }

  removeCursor(): void {
    this.emitPatch({ cursor: undefined });
  }

  cursorValue(element: CanvasElement): CanvasCursorType | null {
    return element.cursor ?? null;
  }

  onCursorChange(value: string | number | boolean | null): void {
    if (typeof value !== 'string') {
      return;
    }
    this.emitPatch({ cursor: (value as CanvasCursorType) || undefined });
  }

  // -- Effects --

  private get defaultEffect(): CanvasEffect {
    return createDefaultCanvasEffect();
  }

  getEffects(element: CanvasElement): CanvasEffect[] {
    return element.effects ?? [];
  }

  trackEffectByIndex(index: number): number {
    return index;
  }

  hasEffects(element: CanvasElement): boolean {
    return (element.effects?.length ?? 0) > 0;
  }

  onEffectSectionHeaderClick(event: MouseEvent): void {
    this.openEffectMenu(event, this.resolveSectionHeaderTrigger(event));
  }

  onEffectSectionToggleClick(event: MouseEvent): void {
    event.stopPropagation();
    this.onEffectSectionHeaderClick(event);
  }

  addEffect(trigger: CanvasEffectTrigger = this.defaultEffect.trigger): void {
    const current = this.selectedElement()?.effects ?? [];
    this.emitPatch({ effects: [...current, createDefaultCanvasEffect(trigger)] });
  }

  removeEffect(index: number): void {
    const current = this.selectedElement()?.effects;
    if (!current) return;

    const updated = current.filter((_, i) => i !== index);
    this.effectPopupViews.clear();
    this.effectPreviewVersions.clear();
    this.emitPatch({ effects: updated.length > 0 ? updated : undefined });
  }

  effectDisplayName(effect: CanvasEffect, index: number): string {
    const fallback = `Effect ${index + 1}`;
    if (effect.trigger === 'focus') {
      return 'Focus';
    }

    return this.lookupEffectOptionLabel(this.effectTriggerOptions, effect.trigger) ?? fallback;
  }

  effectPopupTitle(effect: CanvasEffect, index: number): string {
    return this.effectDisplayName(effect, index);
  }

  effectUsesHoverEditor(effect: CanvasEffect): boolean {
    const trigger = resolveCanvasEffect(effect).trigger;
    return trigger === 'hover' || trigger === 'click';
  }

  effectUsesLoopEditor(effect: CanvasEffect): boolean {
    return resolveCanvasEffect(effect).trigger === 'loop';
  }

  effectSupportsTransition(effect: CanvasEffect): boolean {
    return (
      this.effectUsesHoverEditor(effect) ||
      this.effectUsesLoopEditor(effect) ||
      effect.preset === 'custom'
    );
  }

  effectPopupView(index: number): EffectPopupView {
    return this.effectPopupViews.get(index) ?? 'main';
  }

  effectTransitionSummary(effect: CanvasEffect): string {
    const resolved = resolveCanvasEffect(effect);
    const duration = Math.max(0, Math.round(resolved.duration));
    const delay = Math.max(0, Math.round(resolved.delay));
    const easing =
      this.lookupEffectOptionLabel(this.effectEasingOptions, resolved.easing) ?? 'Ease';
    if (this.effectUsesLoopEditor(resolved)) {
      return `${duration}ms, ${easing}`;
    }

    return delay > 0 ? `${duration}ms, ${easing}, +${delay}ms` : `${duration}ms, ${easing}`;
  }

  effectPreviewStyle(effect: CanvasEffect, index: number): Record<string, string> {
    const resolved = resolveCanvasEffect(effect);
    const usesHoverEditor = this.effectUsesHoverEditor(resolved);
    const usesLoopEditor = this.effectUsesLoopEditor(resolved);
    const usesClickPreview = resolved.trigger === 'click';
    const usesHoverPreview = resolved.trigger === 'hover';
    const loopDelay = usesLoopEditor ? Math.max(0, Math.round(resolved.delay)) : 0;
    const isMirrorLoop = usesLoopEditor && this.effectLoopTypeValue(resolved) === 'mirror';
    const previewDuration = usesLoopEditor
      ? Math.max(320, Math.round(resolved.duration) + loopDelay) * (isMirrorLoop ? 2 : 1)
      : usesHoverPreview
        ? Math.max(180, Math.round(resolved.duration)) * 2 + EFFECT_PREVIEW_HOVER_IDLE_MS
        : Math.max(240, Math.round(resolved.duration)) +
          (usesClickPreview ? EFFECT_PREVIEW_CLICK_IDLE_MS : EFFECT_PREVIEW_HOVER_IDLE_MS);
    const versionOffset = ((this.effectPreviewVersions.get(index) ?? 0) & 1) * 0.001;
    const animationName = usesLoopEditor
      ? this.effectLoopPreviewAnimationName(resolved)
      : usesHoverPreview
        ? 'pp-effect-preview-hover'
        : usesClickPreview
          ? 'pp-effect-preview-press'
          : 'pp-effect-preview-enter';
    const animationDelay = 0;
    const animationDirection = usesLoopEditor ? 'normal' : 'normal';
    const animationFillMode = usesLoopEditor ? resolved.fillMode : 'both';

    return {
      '--pp-effect-preview-from-opacity': this.formatEffectPreviewNumber(
        usesHoverEditor ? 1 : Math.max(0, Math.min(1, resolved.opacity)),
      ),
      '--pp-effect-preview-to-opacity': this.formatEffectPreviewNumber(
        usesHoverEditor ? Math.max(0, Math.min(1, resolved.opacity)) : 1,
      ),
      '--pp-effect-preview-from-transform': this.buildEffectPreviewTransform(
        resolved,
        usesHoverEditor,
      ),
      '--pp-effect-preview-to-transform': this.buildEffectPreviewTransform(
        resolved,
        !usesHoverEditor,
      ),
      '--pp-effect-preview-from-background': usesHoverEditor
        ? EFFECT_PREVIEW_BACKGROUND
        : this.composeEffectPreviewBackground(resolved.fill),
      '--pp-effect-preview-to-background': usesHoverEditor
        ? this.composeEffectPreviewBackground(resolved.fill)
        : EFFECT_PREVIEW_BACKGROUND,
      '--pp-effect-preview-from-box-shadow': usesHoverEditor
        ? EFFECT_PREVIEW_SHADOW
        : this.composeEffectPreviewShadow(resolved.shadow),
      '--pp-effect-preview-to-box-shadow': usesHoverEditor
        ? this.composeEffectPreviewShadow(resolved.shadow)
        : EFFECT_PREVIEW_SHADOW,
      animation: `${animationName} ${previewDuration + versionOffset}ms ${resolved.easing} ${animationDelay}ms infinite ${animationDirection} ${animationFillMode}`,
    };
  }

  effectLoopPreviewAnimationName(effect: CanvasEffect): string {
    const resolved = resolveCanvasEffect(effect);
    const hasPause = resolved.delay > 0;
    const isMirror = this.effectLoopTypeValue(resolved) === 'mirror';

    if (isMirror) {
      return hasPause ? 'pp-effect-preview-mirror' : 'pp-effect-preview-mirror-seamless';
    }

    return hasPause ? 'pp-effect-preview-loop' : 'pp-effect-preview-loop-seamless';
  }

  effectLoopTypeValue(effect: CanvasEffect): 'loop' | 'mirror' {
    const direction = resolveCanvasEffect(effect).direction;
    return direction === 'alternate' || direction === 'alternate-reverse' ? 'mirror' : 'loop';
  }

  effectOffScreenBehaviorValue(effect: CanvasEffect): CanvasEffectOffScreenBehavior {
    return resolveCanvasEffect(effect).offScreenBehavior;
  }

  effectHasActiveFill(effect: CanvasEffect): boolean {
    return typeof effect.fill === 'string' && effect.fill.trim().length > 0;
  }

  effectFillLabel(effect: CanvasEffect): string {
    const fill = effect.fill?.trim();
    if (!fill) {
      return 'None';
    }

    return fill.toLowerCase() === 'transparent' ? 'Transparent' : preserveColorDisplayValue(fill);
  }

  effectIsTransparentFill(effect: CanvasEffect): boolean {
    const fill = effect.fill?.trim();
    return !fill || isTransparentColor(fill);
  }

  effectFillSwatchBackground(effect: CanvasEffect): string | null {
    const fill = effect.fill?.trim();
    return !fill || isTransparentColor(fill) ? null : fill;
  }

  effectFillInputValue(effect: CanvasEffect): string {
    const fill = effect.fill?.trim();
    if (fill) {
      return fill;
    }

    return this.selectedElement() && this.hasFill(this.selectedElement()!.type)
      ? this.fillInputValue(this.selectedElement()!)
      : this.defaultFillColor;
  }

  effectFillPickerValue(effect: CanvasEffect): string {
    const fillValue = this.effectFillInputValue(effect);
    if (fillValue !== 'transparent') {
      return fillValue;
    }

    return this.selectedElement() && this.hasFill(this.selectedElement()!.type)
      ? this.fillPickerValue(this.selectedElement()!)
      : this.defaultFillColor;
  }

  effectHasActiveShadow(effect: CanvasEffect): boolean {
    return hasCanvasShadow(effect.shadow);
  }

  effectShadowSummary(effect: CanvasEffect): string {
    if (!hasCanvasShadow(effect.shadow)) {
      return 'None';
    }

    const shadow = resolveEditableCanvasShadow(effect.shadow);
    return `${this.formatShadowMetric(shadow.x)}, ${this.formatShadowMetric(shadow.y)}, ${this.formatShadowMetric(shadow.spread)}`;
  }

  effectShadowSwatchBackground(effect: CanvasEffect): string | null {
    return this.effectHasActiveShadow(effect)
      ? resolveEditableCanvasShadow(effect.shadow).color
      : null;
  }

  effectShadowEditorValue(effect: CanvasEffect): string | null {
    return (
      normalizeCanvasShadowValue(effect.shadow) ??
      (this.selectedElement()
        ? (normalizeCanvasShadowValue(this.selectedElement()!.shadow) ?? null)
        : null)
    );
  }

  openEffectTransitionSettings(index: number): void {
    this.openEffectPopupSubview(index, 'transition');
  }

  openEffectFillSettings(index: number): void {
    this.openEffectPopupSubview(index, 'fill');
  }

  openEffectShadowSettings(index: number): void {
    this.openEffectPopupSubview(index, 'shadow');
  }

  closeEffectPopupSubview(index: number): void {
    this.effectPopupViews.set(index, 'main');
  }

  onEffectPopupOpenChange(index: number, isOpen: boolean): void {
    if (isOpen) {
      this.effectPopupViews.set(index, 'main');
      return;
    }

    this.effectPopupViews.delete(index);
  }

  effectShowsCustomControls(effect: CanvasEffect): boolean {
    return effect.preset === 'custom';
  }

  effectOpacityValue(effect: CanvasEffect): number {
    return resolveCanvasEffect(effect).opacity;
  }

  effectOpacitySliderPercent(effect: CanvasEffect): string {
    return this.transformSliderPercent(this.effectOpacityValue(effect), 0, 1);
  }

  effectScaleValue(effect: CanvasEffect): number {
    return resolveCanvasEffect(effect).scale;
  }

  effectRotateValue(effect: CanvasEffect): number {
    return resolveCanvasEffect(effect).rotate;
  }

  effectRotationModeValue(effect: CanvasEffect): CanvasRotationMode {
    return resolveCanvasEffect(effect).rotationMode;
  }

  effectSkewXValue(effect: CanvasEffect): number {
    return resolveCanvasEffect(effect).skewX;
  }

  effectSkewYValue(effect: CanvasEffect): number {
    return resolveCanvasEffect(effect).skewY;
  }

  effectOffsetXValue(effect: CanvasEffect): number {
    return resolveCanvasEffect(effect).offsetX;
  }

  effectOffsetYValue(effect: CanvasEffect): number {
    return resolveCanvasEffect(effect).offsetY;
  }

  private patchEffectAt(index: number, patch: Partial<CanvasEffect>): void {
    const effects = this.selectedElement()?.effects;
    if (!effects) return;
    this.bumpEffectPreviewVersion(index);
    this.emitPatch({
      effects: effects.map((e, i) => (i === index ? { ...resolveCanvasEffect(e), ...patch } : e)),
    });
  }

  onEffectPresetChange(index: number, value: string | number | boolean | null): void {
    if (typeof value !== 'string') return;

    const current = this.selectedElement()?.effects?.[index];
    if (!current) return;

    this.closeEffectPopupSubview(index);

    const resolved = resolveCanvasEffect(current);

    if (value === 'custom') {
      this.patchEffectAt(index, { preset: 'custom' });
      return;
    }

    const presetEffect = createDefaultCanvasEffect(resolved.trigger, value as CanvasEffectPreset);
    this.patchEffectAt(index, {
      preset: presetEffect.preset,
      opacity: presetEffect.opacity,
      scale: presetEffect.scale,
      rotate: presetEffect.rotate,
      skewX: presetEffect.skewX,
      skewY: presetEffect.skewY,
      offsetX: presetEffect.offsetX,
      offsetY: presetEffect.offsetY,
    });
  }

  onEffectTriggerChange(index: number, value: string | number | boolean | null): void {
    if (typeof value !== 'string') return;

    if (value === 'hover' || value === 'click' || value === 'loop') {
      const nextEffect = createDefaultCanvasEffect(value as CanvasEffectTrigger);
      this.patchEffectAt(index, {
        trigger: nextEffect.trigger,
        preset: nextEffect.preset,
        opacity: nextEffect.opacity,
        scale: nextEffect.scale,
        rotate: nextEffect.rotate,
        rotationMode: nextEffect.rotationMode,
        skewX: nextEffect.skewX,
        skewY: nextEffect.skewY,
        offsetX: nextEffect.offsetX,
        offsetY: nextEffect.offsetY,
        fill: undefined,
        shadow: undefined,
        duration: nextEffect.duration,
        delay: nextEffect.delay,
        iterations: nextEffect.iterations,
        easing: nextEffect.easing,
        direction: nextEffect.direction,
        fillMode: nextEffect.fillMode,
        offScreenBehavior: nextEffect.offScreenBehavior,
      });
      this.closeEffectPopupSubview(index);
      return;
    }

    this.patchEffectAt(index, { trigger: value as CanvasEffectTrigger });
  }

  onEffectOpacityChange(index: number, value: number): void {
    this.patchEffectAt(index, { opacity: Math.max(0, Math.min(1, value)) });
  }

  onEffectScaleChange(index: number, value: number): void {
    this.patchEffectAt(index, { scale: Math.max(0, value) });
  }

  onEffectRotateChange(index: number, value: number): void {
    this.patchEffectAt(index, { rotate: value });
  }

  onEffectRotationModeChange(index: number, value: string | number | boolean | null): void {
    if (value !== '2d' && value !== '3d') {
      return;
    }

    this.patchEffectAt(index, { rotationMode: value });
  }

  onEffectSkewChange(index: number, axis: 'x' | 'y', value: number): void {
    this.patchEffectAt(index, axis === 'x' ? { skewX: value } : { skewY: value });
  }

  onEffectOffsetChange(index: number, axis: 'x' | 'y', value: number): void {
    this.patchEffectAt(index, axis === 'x' ? { offsetX: value } : { offsetY: value });
  }

  onEffectDurationChange(index: number, value: number): void {
    this.patchEffectAt(index, { duration: value });
  }

  onEffectDelayChange(index: number, value: number): void {
    this.patchEffectAt(index, { delay: value });
  }

  onEffectLoopTypeChange(index: number, value: string | number | boolean | null): void {
    if (value !== 'loop' && value !== 'mirror') {
      return;
    }

    this.patchEffectAt(index, { direction: value === 'mirror' ? 'alternate' : 'normal' });
  }

  onEffectOffScreenBehaviorChange(index: number, value: string | number | boolean | null): void {
    if (value !== 'play' && value !== 'pause') {
      return;
    }

    this.patchEffectAt(index, { offScreenBehavior: value });
  }

  onEffectEasingChange(index: number, value: string | number | boolean | null): void {
    if (typeof value !== 'string') return;
    this.patchEffectAt(index, { easing: value as CanvasEffectEasing });
  }

  onEffectFillPatch(index: number, patch: Partial<CanvasElement>): void {
    if (!Object.prototype.hasOwnProperty.call(patch, 'fill')) {
      return;
    }

    this.patchEffectAt(index, { fill: typeof patch.fill === 'string' ? patch.fill : undefined });
  }

  clearEffectFill(index: number): void {
    this.patchEffectAt(index, { fill: undefined });
  }

  onEffectShadowPatch(index: number, patch: Partial<CanvasElement>): void {
    if (!Object.prototype.hasOwnProperty.call(patch, 'shadow')) {
      return;
    }

    this.patchEffectAt(index, { shadow: normalizeCanvasShadowValue(patch.shadow) });
  }

  clearEffectShadow(index: number): void {
    this.patchEffectAt(index, { shadow: undefined });
  }

  private openEffectMenu(event: MouseEvent | null, trigger: HTMLElement | null): void {
    const element = this.selectedElement();
    const position = this.resolveTransformMenuPosition(event, trigger);
    if (!element || !position) {
      return;
    }

    this.closeTransformMenu();
    this.closeDimensionMenu();
    this.closeAccessibilityMenu();

    if (this.effectMenuItems.length > 0) {
      return;
    }

    this.effectMenuItems = this.buildEffectMenuItems();
    this.effectMenuX = position.x;
    this.effectMenuY = position.y;
  }

  flexDirectionValue(element: CanvasElement): 'row' | 'column' {
    return element.flexDirection === 'column' || element.flexDirection === 'column-reverse'
      ? 'column'
      : 'row';
  }

  flexWrapValue(element: CanvasElement): boolean {
    return element.flexWrap === 'wrap';
  }

  justifyContentValue(element: CanvasElement): CanvasJustifyContent {
    return element.justifyContent ?? 'flex-start';
  }

  justifyContentAxisLabel(element: CanvasElement): 'Distribute' | string {
    return 'Distribute';
  }

  justifyContentPlaceholder(element: CanvasElement): string {
    return `Select ${this.justifyContentAxisLabel(element).toLowerCase()} alignment`;
  }

  alignItemsAxisLabel(element: CanvasElement): 'Align' | string {
    return 'Align';
  }

  alignItemsAriaLabel(element: CanvasElement): string {
    return `${this.alignItemsAxisLabel(element)} layout alignment`;
  }

  alignItemsOptions(element: CanvasElement): readonly ToggleGroupOption[] {
    return this.flexDirectionValue(element) === 'column'
      ? this.alignItemsHorizontalOptions
      : this.alignItemsVerticalOptions;
  }

  alignItemsValue(element: CanvasElement): CanvasAlignItems {
    return element.alignItems === 'center' || element.alignItems === 'flex-end'
      ? element.alignItems
      : 'flex-start';
  }

  spacingValue(
    element: CanvasElement,
    type: 'padding' | 'margin',
    side: keyof CanvasSpacing,
  ): number {
    return element[type]?.[side] ?? 0;
  }

  private getSpacingValues(element: CanvasElement, type: 'padding' | 'margin'): CanvasSpacing {
    return element[type] ?? { top: 0, right: 0, bottom: 0, left: 0 };
  }

  private hasPerSidePadding(element: CanvasElement): boolean {
    const padding = this.getSpacingValues(element, 'padding');
    return !(
      padding.top === padding.right &&
      padding.top === padding.bottom &&
      padding.top === padding.left
    );
  }

  addLayout(): void {
    this.emitPatch({
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
    });
  }

  addLink(): void {
    const pageId = this.firstAvailableLinkPageId();

    if (pageId) {
      this.emitPatch({
        linkType: 'page',
        linkPageId: pageId,
        linkUrl: undefined,
        tag: undefined,
      });
      return;
    }

    this.emitPatch({
      linkType: 'url',
      linkPageId: undefined,
      linkUrl: '',
      tag: undefined,
    });
  }

  removeLayout(): void {
    this.emitPatch({
      display: undefined,
      flexDirection: undefined,
      flexWrap: undefined,
      justifyContent: undefined,
      alignItems: undefined,
      gap: undefined,
      gapX: undefined,
      gapY: undefined,
      gridTemplateColumns: undefined,
      gridTemplateRows: undefined,
      padding: undefined,
    });
  }

  removeLink(): void {
    this.emitPatch({
      linkType: undefined,
      linkPageId: undefined,
      linkUrl: undefined,
      tag: undefined,
    });
  }

  hasAccessibilityFields(element: CanvasElement): boolean {
    return (
      this.hasAccessibilityField(element, 'tag') || this.hasAccessibilityField(element, 'ariaLabel')
    );
  }

  hasAccessibilityField(element: CanvasElement, field: AccessibilityField): boolean {
    if (field === 'tag') {
      return this.hasLink(element) || !!getResolvedCanvasTag(element);
    }

    return (
      !!normalizeCanvasAccessibilityLabel(element.ariaLabel) ||
      this.hasAccessibilityFieldOverride(element.id, field)
    );
  }

  supportsAccessibilityTag(element: CanvasElement): boolean {
    return this.hasLink(element) || supportsCustomAccessibilityTag(element.type);
  }

  accessibilityTagOptions(element: CanvasElement): DropdownSelectOption[] {
    if (this.hasLink(element)) {
      return [{ label: 'a', value: 'a' }];
    }

    return getAllowedCustomAccessibilityTags(element.type).map((tag) => ({
      label: tag,
      value: tag,
    }));
  }

  accessibilityTagValue(element: CanvasElement): CanvasSemanticTag | '' {
    return getResolvedCanvasTag(element) ?? '';
  }

  isAccessibilityTagLocked(element: CanvasElement): boolean {
    return this.hasLink(element);
  }

  accessibilityLabelValue(element: CanvasElement): string {
    return element.ariaLabel ?? '';
  }

  accessibilityLabelPlaceholder(element: CanvasElement): string {
    return element.type === 'image' ? 'Image alt' : 'Short label';
  }

  accessibilityTagPlaceholder(element: CanvasElement): string {
    return this.supportsAccessibilityTag(element) ? 'Select tag' : 'Unavailable';
  }

  onTransformScaleChange(value: number): void {
    if (!Number.isFinite(value)) {
      return;
    }

    const element = this.selectedElement();
    if (!element) {
      return;
    }

    const magnitude = Math.max(0.1, roundToTwoDecimals(Math.abs(value)));
    const scaleXSign = (element.scaleX ?? 1) < 0 ? -1 : 1;
    const scaleYSign = (element.scaleY ?? 1) < 0 ? -1 : 1;

    this.emitPatch({
      transformOptions: this.mergeTransformOptions(element, 'scale'),
      scaleX: roundToTwoDecimals(scaleXSign * magnitude),
      scaleY: roundToTwoDecimals(scaleYSign * magnitude),
    });
  }

  onRotationChange(value: number): void {
    if (!Number.isFinite(value)) {
      return;
    }

    const element = this.selectedElement();
    if (!element) {
      return;
    }

    this.emitPatch({
      transformOptions: this.mergeTransformOptions(element, 'rotate'),
      rotation: roundToTwoDecimals(value),
    });
  }

  onRotationModeChange(value: string | number | boolean | null): void {
    if (value !== '2d' && value !== '3d') {
      return;
    }

    const element = this.selectedElement();
    if (!element) {
      return;
    }

    this.emitPatch({
      transformOptions: this.mergeTransformOptions(element, 'rotate'),
      rotationMode: value,
    });
  }

  onSkewChange(axis: 'x' | 'y', value: number): void {
    if (!Number.isFinite(value)) {
      return;
    }

    const element = this.selectedElement();
    if (!element) {
      return;
    }

    this.emitPatch({
      transformOptions: this.mergeTransformOptions(element, 'skew'),
      skewX: axis === 'x' ? roundToTwoDecimals(value) : this.skewXValue(element),
      skewY: axis === 'y' ? roundToTwoDecimals(value) : this.skewYValue(element),
    });
  }

  onDepthChange(value: number): void {
    if (!Number.isFinite(value)) {
      return;
    }

    const element = this.selectedElement();
    if (!element) {
      return;
    }

    this.emitPatch({
      transformOptions: this.mergeTransformOptions(element, 'depth'),
      depth: Math.max(
        TRANSFORM_DEPTH_MIN,
        Math.min(TRANSFORM_DEPTH_MAX, roundToTwoDecimals(value)),
      ),
    });
  }

  onPerspectiveChange(value: number): void {
    if (!Number.isFinite(value)) {
      return;
    }

    const element = this.selectedElement();
    if (!element) {
      return;
    }

    this.emitPatch({
      transformOptions: this.mergeTransformOptions(element, 'perspective'),
      perspective: Math.max(
        TRANSFORM_PERSPECTIVE_MIN,
        Math.min(TRANSFORM_PERSPECTIVE_MAX, roundToTwoDecimals(value)),
      ),
    });
  }

  onOriginChange(axis: 'x' | 'y', value: number): void {
    if (!Number.isFinite(value)) {
      return;
    }

    const element = this.selectedElement();
    if (!element) {
      return;
    }

    const normalized = Math.max(0, Math.min(100, roundToTwoDecimals(value)));
    this.emitPatch({
      transformOptions: this.mergeTransformOptions(element, 'origin'),
      transformOriginX: axis === 'x' ? normalized : this.originXValue(element),
      transformOriginY: axis === 'y' ? normalized : this.originYValue(element),
    });
  }

  onBackfaceVisibilityChange(value: string | number | boolean | null): void {
    if (value !== 'visible' && value !== 'hidden') {
      return;
    }

    const element = this.selectedElement();
    if (!element) {
      return;
    }

    this.emitPatch({
      transformOptions: this.mergeTransformOptions(element, 'backface'),
      backfaceVisibility: value,
    });
  }

  onPreserve3DChange(value: string | number | boolean | null): void {
    if (typeof value !== 'boolean') {
      return;
    }

    const element = this.selectedElement();
    if (!element) {
      return;
    }

    this.emitPatch({
      transformOptions: this.mergeTransformOptions(element, 'preserve3d'),
      preserve3D: value,
    });
  }

  onDisplayChange(value: string | number | boolean): void {
    if (value !== 'flex' && value !== 'grid') {
      return;
    }

    this.emitPatch({ display: value as CanvasDisplayMode });
  }

  gridColumnsValue(element: CanvasElement): number {
    return resolveGridTrackCount(element.gridTemplateColumns, 2);
  }

  gridRowsValue(element: CanvasElement): number {
    return resolveGridTrackCount(element.gridTemplateRows, 1);
  }

  gridGapXValue(element: CanvasElement): number {
    return typeof element.gapX === 'number' ? element.gapX : (element.gap ?? 0);
  }

  gridGapYValue(element: CanvasElement): number {
    return typeof element.gapY === 'number' ? element.gapY : (element.gap ?? 0);
  }

  onGridTrackCountChange(field: 'gridTemplateColumns' | 'gridTemplateRows', value: number): void {
    if (!Number.isFinite(value)) {
      return;
    }

    const count = Math.max(1, Math.round(value));
    this.emitPatch({ [field]: buildRepeatedGridTrackTemplate(count) } as Partial<CanvasElement>);
  }

  onGridGapChange(axis: 'x' | 'y', value: number): void {
    if (!Number.isFinite(value)) {
      return;
    }

    const element = this.selectedElement();
    if (!element) {
      return;
    }

    const normalized = Math.max(0, roundToTwoDecimals(value));
    this.emitPatch({
      gap: undefined,
      gapX: axis === 'x' ? normalized : this.gridGapXValue(element),
      gapY: axis === 'y' ? normalized : this.gridGapYValue(element),
    });
  }

  onPositionChange(value: string | number | boolean | null): void {
    if (typeof value !== 'string') {
      return;
    }

    this.emitPatch({
      position: value === 'static' ? undefined : (value as CanvasPositionMode),
    });
  }

  onFlexDirectionChange(value: string | number | boolean): void {
    if (value !== 'row' && value !== 'column') {
      return;
    }

    this.emitPatch({ flexDirection: value });
  }

  onFlexWrapToggle(wrap: boolean): void {
    this.emitPatch({ flexWrap: wrap ? 'wrap' : 'nowrap' } as Partial<CanvasElement>);
  }

  onJustifyContentChange(value: string | number | boolean | null): void {
    if (typeof value !== 'string') {
      return;
    }

    this.emitPatch({ justifyContent: value as CanvasJustifyContent });
  }

  onAlignItemsChange(value: string | number | boolean | null): void {
    if (typeof value !== 'string') {
      return;
    }

    this.emitPatch({ alignItems: value as CanvasAlignItems });
  }

  onTextMetricUnitChange(
    field: EditableTextMetricUnitField,
    value: string | number | boolean | null,
  ): void {
    const element = this.selectedElement();
    if (!element || typeof value !== 'string') {
      return;
    }

    if (field === 'fontSizeUnit') {
      if (value !== 'px' && value !== 'rem') {
        return;
      }

      const currentUnit = this.fontSizeUnitValue(element);
      if (currentUnit === value) {
        return;
      }

      const currentValue = element.fontSize ?? 16;
      const nextValue =
        currentUnit === 'px'
          ? roundToTwoDecimals(currentValue / 16)
          : roundToTwoDecimals(currentValue * 16);

      this.emitPatch({ fontSize: nextValue, fontSizeUnit: value });
      return;
    }

    if (value !== 'px' && value !== 'em') {
      return;
    }

    const currentValue =
      field === 'lineHeightUnit' ? (element.lineHeight ?? 1.2) : (element.letterSpacing ?? 0);
    const currentUnit =
      field === 'lineHeightUnit'
        ? this.lineHeightUnitValue(element)
        : this.letterSpacingUnitValue(element);

    if (currentUnit === value) {
      return;
    }

    const fontSizeInPixels = this.fontSizeInPixels(element);
    const nextValue =
      currentUnit === 'px'
        ? roundToTwoDecimals(currentValue / fontSizeInPixels)
        : roundToTwoDecimals(currentValue * fontSizeInPixels);

    this.emitPatch(
      field === 'lineHeightUnit'
        ? { lineHeight: nextValue, lineHeightUnit: value }
        : { letterSpacing: nextValue, letterSpacingUnit: value },
    );
  }

  onGridTemplateChange(field: 'gridTemplateColumns' | 'gridTemplateRows', event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.emitPatch({ [field]: value.trim() || undefined } as Partial<CanvasElement>);
  }

  onSpacingChange(type: 'padding' | 'margin', side: keyof CanvasSpacing, value: number): void {
    if (!Number.isFinite(value)) return;
    const element = this.selectedElement();
    if (!element) return;
    const current: CanvasSpacing = element[type] ?? { top: 0, right: 0, bottom: 0, left: 0 };
    this.emitPatch({ [type]: { ...current, [side]: value } } as Partial<CanvasElement>);
  }

  setFontStyle(style: CanvasFontStyle): void {
    this.emitPatch({ fontStyle: style });
  }

  setTextAlign(align: CanvasTextAlign): void {
    this.emitPatch({ textAlign: align });
  }

  onTextAlignChange(value: string | number | boolean | null): void {
    if (value === 'left' || value === 'center' || value === 'right' || value === 'justify') {
      this.setTextAlign(value);
    }
  }

  onLinkTypeChange(value: string | number | boolean | null): void {
    if (value === 'page') {
      this.emitPatch({
        linkType: 'page',
        linkPageId: this.firstAvailableLinkPageId(),
        linkUrl: undefined,
        tag: undefined,
      });
      return;
    }

    if (value === 'url') {
      this.emitPatch({
        linkType: 'url',
        linkPageId: undefined,
        linkUrl: '',
        tag: undefined,
      });
    }
  }

  onLinkPageChange(value: string | number | boolean | null): void {
    if (typeof value !== 'string' || !this.pages().some((page) => page.id === value)) {
      return;
    }

    this.emitPatch({
      linkType: 'page',
      linkPageId: value,
      linkUrl: undefined,
      tag: undefined,
    });
  }

  onLinkUrlChange(event: Event): void {
    this.emitPatch({
      linkType: 'url',
      linkPageId: undefined,
      linkUrl: (event.target as HTMLInputElement).value,
      tag: undefined,
    });
  }

  onAccessibilityTagChange(value: string | number | boolean | null): void {
    const element = this.selectedElement();
    if (!element || this.hasLink(element) || typeof value !== 'string') {
      return;
    }

    this.emitPatch({
      tag: normalizeStoredCanvasTag(element.type, value, false),
    });
  }

  onAccessibilityLabelChange(event: Event): void {
    const element = this.selectedElement();
    if (element) {
      this.setAccessibilityFieldOverride(element.id, 'ariaLabel', true);
    }

    this.emitPatch({
      ariaLabel: normalizeCanvasAccessibilityLabel((event.target as HTMLInputElement).value),
    });
  }

  setTextVerticalAlign(align: CanvasTextVerticalAlign): void {
    this.emitPatch({ textVerticalAlign: align });
  }

  private emitPatch(patch: Partial<CanvasElement>): void {
    this.elementPatch.emit(patch);
  }

  private lookupEffectOptionLabel(
    options: readonly DropdownSelectOption[],
    value: string,
  ): string | null {
    const match = options.find((option) => option.value === value);
    return typeof match?.label === 'string' ? match.label : null;
  }

  private openEffectPopupSubview(index: number, view: Exclude<EffectPopupView, 'main'>): void {
    const current = this.selectedElement()?.effects?.[index];
    if (!current) {
      return;
    }

    if (view === 'transition' && !this.effectSupportsTransition(current)) {
      return;
    }

    if ((view === 'fill' || view === 'shadow') && !this.effectUsesHoverEditor(current)) {
      return;
    }

    this.effectPopupViews.set(index, view);
  }

  private bumpEffectPreviewVersion(index: number): void {
    this.effectPreviewVersions.set(index, (this.effectPreviewVersions.get(index) ?? 0) + 1);
  }

  private buildEffectPreviewTransform(effect: CanvasEffect, identity: boolean): string {
    const offsetX = identity ? 0 : effect.offsetX;
    const offsetY = identity ? 0 : effect.offsetY;
    const scale = identity ? 1 : effect.scale;
    const rotate = identity ? 0 : effect.rotate;
    const skewX = identity ? 0 : effect.skewX;
    const skewY = identity ? 0 : effect.skewY;
    const rotation =
      effect.rotationMode === '3d'
        ? `rotateY(${this.formatEffectPreviewNumber(rotate)}deg)`
        : `rotate(${this.formatEffectPreviewNumber(rotate)}deg)`;

    return [
      `translate(${this.formatEffectPreviewNumber(offsetX)}px, ${this.formatEffectPreviewNumber(offsetY)}px)`,
      `scale(${this.formatEffectPreviewNumber(scale)})`,
      rotation,
      `skew(${this.formatEffectPreviewNumber(skewX)}deg, ${this.formatEffectPreviewNumber(skewY)}deg)`,
    ].join(' ');
  }

  private composeEffectPreviewBackground(fill?: string): string {
    const normalized = fill?.trim();
    if (!normalized) {
      return EFFECT_PREVIEW_BACKGROUND;
    }

    return `linear-gradient(180deg, rgba(255, 255, 255, 0.18), rgba(255, 255, 255, 0.06)), ${normalized}`;
  }

  private composeEffectPreviewShadow(shadow?: string): string {
    const normalized = shadow?.trim();
    return normalized ? getCanvasShadowCss(normalized) : EFFECT_PREVIEW_SHADOW;
  }

  private formatEffectPreviewNumber(value: number): string {
    return String(roundToTwoDecimals(value));
  }

  private currentPageModel(): CanvasPageModel | null {
    const currentPageId = this.currentPageId();
    if (!currentPageId) {
      return this.pages()[0] ?? null;
    }

    return this.pages().find((page) => page.id === currentPageId) ?? this.pages()[0] ?? null;
  }

  private parentElement(element: CanvasElement): CanvasElement | null {
    if (!element.parentId) {
      return null;
    }

    const parent =
      this.currentPageModel()?.elements.find((candidate) => candidate.id === element.parentId) ??
      null;
    if (!parent) {
      return null;
    }

    const paddedWidth = parent.width + ((parent.padding?.left ?? 0) + (parent.padding?.right ?? 0));
    const paddedHeight =
      parent.height + ((parent.padding?.top ?? 0) + (parent.padding?.bottom ?? 0));
    const isFlowLayoutChild =
      !!parent.display &&
      (parent.type === 'frame' || parent.type === 'rectangle') &&
      (!element.position ||
        element.position === 'static' ||
        element.position === 'relative' ||
        element.position === 'sticky');

    return {
      ...parent,
      width: paddedWidth,
      height: paddedHeight,
      padding: isFlowLayoutChild ? parent.padding : undefined,
    };
  }

  private buildDimensionMenuItems(element: CanvasElement): ContextMenuItem[] {
    return DIMENSION_CONSTRAINT_FIELD_DEFINITIONS.map((field) => ({
      id: field.id,
      label: field.label,
      checked: this.hasDimensionConstraintField(element, field.id),
      showCheckSlot: true,
      action: () => this.toggleDimensionConstraintField(field.id),
    }));
  }

  private buildEffectMenuItems(): ContextMenuItem[] {
    return this.effectTriggerOptions.map((option) => ({
      id: String(option.value),
      label: option.label,
      action: () => {
        this.addEffect(option.value as CanvasEffectTrigger);
        this.closeEffectMenu();
      },
    }));
  }

  private toggleDimensionConstraintField(field: DimensionConstraintField): void {
    const element = this.selectedElement();
    if (!element) {
      return;
    }

    if (this.hasDimensionConstraintField(element, field)) {
      this.emitPatch({
        [field]: undefined,
        [getCanvasConstraintModeField(field)]: undefined,
        [getCanvasConstraintSizeValueField(field)]: undefined,
      } as Partial<CanvasElement>);
      this.closeDimensionMenu();
      return;
    }

    const axis: CanvasSizeAxis = field === 'minWidth' || field === 'maxWidth' ? 'width' : 'height';
    this.emitPatch({
      [field]: getCanvasFixedSize(element, axis),
      [getCanvasConstraintModeField(field)]: undefined,
      [getCanvasConstraintSizeValueField(field)]: undefined,
    } as Partial<CanvasElement>);
    this.closeDimensionMenu();
  }

  private buildAccessibilityMenuItems(element: CanvasElement): ContextMenuItem[] {
    return ACCESSIBILITY_FIELD_DEFINITIONS.map((field) => ({
      id: field.id,
      label: field.label,
      checked: this.hasAccessibilityField(element, field.id),
      showCheckSlot: true,
      disabled: field.id === 'tag' && this.hasLink(element),
      action: () => this.toggleAccessibilityField(field.id),
    }));
  }

  private toggleAccessibilityField(field: AccessibilityField): void {
    const element = this.selectedElement();
    if (!element) {
      return;
    }

    if (field === 'tag') {
      if (this.hasLink(element)) {
        this.closeAccessibilityMenu();
        return;
      }

      if (this.hasAccessibilityField(element, 'tag')) {
        this.emitPatch({ tag: undefined });
      } else {
        this.emitPatch({ tag: getDefaultAccessibilityTag(element.type) });
      }

      this.closeAccessibilityMenu();
      return;
    }

    const isActive = this.hasAccessibilityField(element, field);
    this.setAccessibilityFieldOverride(element.id, field, !isActive);

    if (isActive) {
      this.emitPatch({ ariaLabel: undefined });
    }

    this.closeAccessibilityMenu();
  }

  private hasAccessibilityFieldOverride(elementId: string, field: AccessibilityField): boolean {
    return this.accessibilityFieldOverrides.get(elementId)?.has(field) ?? false;
  }

  private setAccessibilityFieldOverride(
    elementId: string,
    field: AccessibilityField,
    isActive: boolean,
  ): void {
    const current = this.accessibilityFieldOverrides.get(elementId);
    const next = new Set<AccessibilityField>(current ?? []);

    if (isActive) {
      next.add(field);
    } else {
      next.delete(field);
    }

    if (next.size === 0) {
      this.accessibilityFieldOverrides.delete(elementId);
      return;
    }

    this.accessibilityFieldOverrides.set(elementId, next);
  }

  private buildTransformMenuItems(element: CanvasElement): ContextMenuItem[] {
    return this.transformOptionDefinitions.map((option) => {
      const isActive = this.isTransformOptionAdded(element, option.id);

      return {
        id: option.id,
        label: option.label,
        checked: isActive,
        showCheckSlot: true,
        action: () => this.toggleTransformOption(option.id),
      };
    });
  }

  private toggleTransformOption(option: CanvasTransformOption): void {
    const element = this.selectedElement();
    if (!element) {
      return;
    }

    const patch = this.isTransformOptionAdded(element, option)
      ? this.buildRemoveTransformOptionPatch(element, option)
      : this.buildTransformOptionPatch(element, option);

    this.emitPatch(patch);
    this.closeTransformMenu();
  }

  private activeTransformOptions(element: CanvasElement): CanvasTransformOption[] {
    const explicitOptions = Array.isArray(element.transformOptions) ? element.transformOptions : [];
    const active = new Set<CanvasTransformOption>(explicitOptions);

    if ((element.scaleX ?? 1) !== 1 || (element.scaleY ?? 1) !== 1) {
      active.add('scale');
    }

    if ((element.rotation ?? 0) !== 0 || element.rotationMode === '3d') {
      active.add('rotate');
    }

    if ((element.skewX ?? 0) !== 0 || (element.skewY ?? 0) !== 0) {
      active.add('skew');
    }

    if ((element.depth ?? 0) !== 0) {
      active.add('depth');
    }

    if (element.perspective !== undefined) {
      active.add('perspective');
    }

    if (element.transformOriginX !== undefined || element.transformOriginY !== undefined) {
      active.add('origin');
    }

    if (element.backfaceVisibility !== undefined) {
      active.add('backface');
    }

    if (element.preserve3D !== undefined) {
      active.add('preserve3d');
    }

    return this.transformOptionDefinitions
      .map((option) => option.id)
      .filter((option) => active.has(option));
  }

  private mergeTransformOptions(
    element: CanvasElement,
    ...options: CanvasTransformOption[]
  ): CanvasTransformOption[] {
    const next = new Set<CanvasTransformOption>(this.activeTransformOptions(element));
    for (const option of options) {
      next.add(option);
    }

    return this.transformOptionDefinitions
      .map((option) => option.id)
      .filter((option) => next.has(option));
  }

  private removeTransformOptions(
    element: CanvasElement,
    ...options: CanvasTransformOption[]
  ): CanvasTransformOption[] | undefined {
    const removed = new Set<CanvasTransformOption>(options);
    const next = this.activeTransformOptions(element).filter((option) => !removed.has(option));

    return next.length > 0 ? next : undefined;
  }

  private buildTransformOptionPatch(
    element: CanvasElement,
    option: CanvasTransformOption,
  ): Partial<CanvasElement> {
    const transformOptions = this.mergeTransformOptions(element, option);

    switch (option) {
      case 'scale':
        return {
          transformOptions,
          scaleX: element.scaleX ?? 1,
          scaleY: element.scaleY ?? 1,
        };
      case 'rotate':
        return {
          transformOptions,
          rotation: element.rotation ?? 0,
          rotationMode: this.rotationModeValue(element),
        };
      case 'skew':
        return {
          transformOptions,
          skewX: element.skewX ?? 0,
          skewY: element.skewY ?? 0,
        };
      case 'depth':
        return {
          transformOptions,
          depth: element.depth ?? 0,
        };
      case 'perspective':
        return {
          transformOptions,
          perspective: element.perspective ?? 1200,
        };
      case 'origin':
        return {
          transformOptions,
          transformOriginX: element.transformOriginX ?? 50,
          transformOriginY: element.transformOriginY ?? 50,
        };
      case 'backface':
        return {
          transformOptions,
          backfaceVisibility: element.backfaceVisibility ?? 'visible',
        };
      case 'preserve3d':
        return {
          transformOptions,
          preserve3D: element.preserve3D ?? true,
        };
      default:
        return { transformOptions };
    }
  }

  private buildRemoveTransformOptionPatch(
    element: CanvasElement,
    option: CanvasTransformOption,
  ): Partial<CanvasElement> {
    const transformOptions = this.removeTransformOptions(element, option);

    switch (option) {
      case 'scale':
        return {
          transformOptions,
          scaleX: undefined,
          scaleY: undefined,
        };
      case 'rotate':
        return {
          transformOptions,
          rotation: undefined,
          rotationMode: undefined,
        };
      case 'skew':
        return {
          transformOptions,
          skewX: undefined,
          skewY: undefined,
        };
      case 'depth':
        return {
          transformOptions,
          depth: undefined,
        };
      case 'perspective':
        return {
          transformOptions,
          perspective: undefined,
        };
      case 'origin':
        return {
          transformOptions,
          transformOriginX: undefined,
          transformOriginY: undefined,
        };
      case 'backface':
        return {
          transformOptions,
          backfaceVisibility: undefined,
        };
      case 'preserve3d':
        return {
          transformOptions,
          preserve3D: undefined,
        };
      default:
        return { transformOptions };
    }
  }

  private fontSizeInPixels(element: CanvasElement): number {
    const fontSize = element.fontSize ?? 16;
    return this.fontSizeUnitValue(element) === 'rem' ? fontSize * 16 : fontSize;
  }

  private firstAvailableLinkPageId(): string | undefined {
    const selectedPageId =
      this.selectedElement()?.linkType === 'page' &&
      typeof this.selectedElement()?.linkPageId === 'string'
        ? this.selectedElement()?.linkPageId
        : null;

    return this.pages().find(
      (page) => page.id !== this.currentPageId() || page.id === selectedPageId,
    )?.id;
  }

  private toHexColorOrFallback(value: string | undefined, fallback: string): string {
    if (!value) {
      return fallback;
    }

    const normalized = value.trim();
    if (normalized.toLowerCase() === 'transparent') {
      return 'transparent';
    }

    if (
      /^#([A-Fa-f0-9]{3}|[A-Fa-f0-9]{4}|[A-Fa-f0-9]{6}|[A-Fa-f0-9]{8})$/.test(normalized) ||
      /^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)$/i.test(
        normalized,
      ) ||
      /^hsla?\(\s*[+-]?\d*\.?\d+\s*(?:deg)?\s*,\s*\d*\.?\d+%\s*,\s*\d*\.?\d+%(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)$/i.test(
        normalized,
      )
    ) {
      return normalized;
    }

    return fallback;
  }
}

function preserveColorDisplayValue(value: string): string {
  return value.startsWith('#') ? value.toUpperCase() : value;
}

function isTransparentColor(value: string): boolean {
  if (value.toLowerCase() === 'transparent') {
    return true;
  }

  if (/^#([A-Fa-f0-9]{4}|[A-Fa-f0-9]{8})$/.test(value)) {
    const alphaHex = value.length === 5 ? value[4] : value.slice(7, 9);
    return alphaHex.toLowerCase() === '0' || alphaHex.toLowerCase() === '00';
  }

  const rgbaMatch = value.match(
    /^rgba\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*(\d*\.?\d+)\s*\)$/i,
  );
  if (rgbaMatch) {
    return Number(rgbaMatch[1]) === 0;
  }

  return false;
}

function buildRepeatedGridTrackTemplate(count: number): string {
  return `repeat(${Math.max(1, Math.round(count))}, minmax(0, 1fr))`;
}

function resolveGridTrackCount(template: string | undefined, fallback: number): number {
  const normalized = template?.trim();
  if (!normalized) {
    return fallback;
  }

  const repeatMatch = normalized.match(/^repeat\(\s*(\d+)\s*,/i);
  if (repeatMatch) {
    return Math.max(1, Number.parseInt(repeatMatch[1], 10));
  }

  const tracks = splitGridTrackTemplate(normalized);
  return tracks.length > 0 ? tracks.length : fallback;
}

function splitGridTrackTemplate(template: string): string[] {
  const tracks: string[] = [];
  let depth = 0;
  let token = '';

  for (const char of template.trim()) {
    if (char === '(') {
      depth++;
      token += char;
      continue;
    }

    if (char === ')') {
      depth = Math.max(0, depth - 1);
      token += char;
      continue;
    }

    if (/\s/.test(char) && depth === 0) {
      if (token.trim().length > 0) {
        tracks.push(token.trim());
        token = '';
      }
      continue;
    }

    token += char;
  }

  if (token.trim().length > 0) {
    tracks.push(token.trim());
  }

  return tracks;
}
