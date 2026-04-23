import { Injectable, inject } from '@angular/core';
import { CanvasElement, CanvasPageModel } from '@app/core';
import { CanvasElementService } from './canvas-element.service';
import { getCanvasShadowCss } from '../utils/element/canvas-shadow.util';
import {
  buildCanvasElementTransform,
  buildCanvasElementTransformOrigin,
  buildCanvasElementBackfaceVisibility,
  buildCanvasElementTransformStyle,
} from '../utils/element/canvas-transform.util';
import {
  getResolvedCornerRadii,
  hasPerCornerRadius,
  getStrokeWidth,
  hasPerSideStrokeWidths,
  getStrokeWidths,
} from '../utils/element/canvas-element-normalization.util';

export type DomStyleMap = Record<string, string | null | undefined>;

@Injectable()
export class CanvasDomStyleService {
  private readonly elService = inject(CanvasElementService);

  buildStyle(
    element: CanvasElement,
    allElements: CanvasElement[],
    page?: CanvasPageModel | null,
  ): DomStyleMap {
    const parent = this.elService.findElementById(element.parentId ?? null, allElements);
    return {
      ...this.buildElementStyle(element, allElements, page),
      ...this.buildPositionStyle(element, parent),
      ...this.buildFlexChildStyle(element, parent),
    };
  }

  private buildElementStyle(
    element: CanvasElement,
    allElements: CanvasElement[],
    page?: CanvasPageModel | null,
  ): DomStyleMap {
    const style: DomStyleMap = {};

    // ── Sizing ────────────────────────────────────────────
    style['width'] = this.elService.getRenderedWidthStyle(element, allElements, page);
    style['height'] = this.elService.getRenderedHeightStyle(element, allElements, page);
    style['box-sizing'] = 'border-box';

    const minW = this.elService.getRenderedMinWidthStyle(element, allElements, page);
    const maxW = this.elService.getRenderedMaxWidthStyle(element, allElements, page);
    const minH = this.elService.getRenderedMinHeightStyle(element, allElements, page);
    const maxH = this.elService.getRenderedMaxHeightStyle(element, allElements, page);
    if (minW) style['min-width'] = minW;
    if (maxW) style['max-width'] = maxW;
    if (minH) style['min-height'] = minH;
    if (maxH) style['max-height'] = maxH;

    // ── Fill / Background ────────────────────────────────
    if (element.type !== 'text' && element.type !== 'image') {
      if (element.fillMode === 'image' && element.backgroundImage) {
        style['background-image'] = `url("${element.backgroundImage}")`;
        style['background-size'] = element.backgroundSize ?? 'cover';
        style['background-position'] = element.backgroundPosition ?? 'center';
        style['background-repeat'] = element.backgroundRepeat ?? 'no-repeat';
      } else if (element.fill) {
        style['background-color'] = element.fill;
      }
    }

    // ── Stroke / Border ───────────────────────────────────
    if (element.type !== 'text' && element.stroke) {
      const strokeStyleCss = (element.strokeStyle ?? 'Solid').toLowerCase();
      if (hasPerSideStrokeWidths(element)) {
        const widths = getStrokeWidths(element);
        style['border-top'] = `${widths.top}px ${strokeStyleCss} ${element.stroke}`;
        style['border-right'] = `${widths.right}px ${strokeStyleCss} ${element.stroke}`;
        style['border-bottom'] = `${widths.bottom}px ${strokeStyleCss} ${element.stroke}`;
        style['border-left'] = `${widths.left}px ${strokeStyleCss} ${element.stroke}`;
      } else {
        const sw = getStrokeWidth(element);
        if (sw > 0) {
          style['outline'] = `${sw}px ${strokeStyleCss} ${element.stroke}`;
          style['outline-offset'] = `-${sw}px`;
        }
      }
    }

    // ── Corner Radius ─────────────────────────────────────
    if (element.type !== 'text') {
      const effectiveRadius =
        (element.cornerRadius ?? 0) > 0 || hasPerCornerRadius(element) || element.type === 'image';
      if (effectiveRadius) {
        const radii = getResolvedCornerRadii(element);
        if (
          radii.topLeft === radii.topRight &&
          radii.topRight === radii.bottomRight &&
          radii.bottomRight === radii.bottomLeft
        ) {
          style['border-radius'] = `${radii.topLeft}px`;
        } else {
          style['border-radius'] =
            `${radii.topLeft}px ${radii.topRight}px ${radii.bottomRight}px ${radii.bottomLeft}px`;
        }
      }
    }

    // ── Overflow ──────────────────────────────────────────
    if (element.type === 'frame' || element.type === 'rectangle') {
      const ov = element.overflow ?? 'clip';
      style['overflow'] =
        ov === 'clip' || ov === 'hidden' ? 'hidden' : ov === 'scroll' ? 'auto' : 'visible';
    }

    // ── Opacity ───────────────────────────────────────────
    if (typeof element.opacity === 'number' && element.opacity !== 1) {
      style['opacity'] = String(element.opacity);
    }

    // ── Blend Mode ────────────────────────────────────────
    if (element.blendMode && element.blendMode !== 'normal') {
      style['mix-blend-mode'] = element.blendMode;
    }

    // ── Box Shadow ────────────────────────────────────────
    if (element.shadow) {
      const shadowCss = getCanvasShadowCss(element.shadow);
      if (shadowCss !== 'none') {
        style['box-shadow'] = shadowCss;
      }
    }

    // ── Layout (flex / grid / block) ──────────────────────
    if (element.display === 'flex') {
      style['display'] = 'flex';
      style['flex-direction'] = element.flexDirection ?? 'row';
      style['justify-content'] = element.justifyContent ?? 'flex-start';
      style['align-items'] = element.alignItems ?? 'flex-start';
      style['flex-wrap'] = element.flexWrap ?? 'nowrap';
      const gapX = element.gapX ?? element.gap;
      const gapY = element.gapY ?? element.gap;
      if (typeof gapX === 'number' && typeof gapY === 'number') {
        style['gap'] = `${gapY}px ${gapX}px`;
      } else if (typeof gapX === 'number') {
        style['gap'] = `${gapX}px`;
      } else if (typeof gapY === 'number') {
        style['gap'] = `${gapY}px`;
      }
    } else if (element.display === 'grid') {
      style['display'] = 'grid';
      if (element.gridTemplateColumns) style['grid-template-columns'] = element.gridTemplateColumns;
      if (element.gridTemplateRows) style['grid-template-rows'] = element.gridTemplateRows;
      const gapX = element.gapX ?? element.gap;
      const gapY = element.gapY ?? element.gap;
      if (typeof gapX === 'number' && typeof gapY === 'number') {
        style['gap'] = `${gapY}px ${gapX}px`;
      } else if (typeof gapX === 'number') {
        style['gap'] = `${gapX}px`;
      } else if (typeof gapY === 'number') {
        style['gap'] = `${gapY}px`;
      }
    } else if (element.display === 'block') {
      style['display'] = 'block';
    }

    // ── Padding ───────────────────────────────────────────
    if (element.padding) {
      const p = element.padding;
      style['padding'] = `${p.top}px ${p.right}px ${p.bottom}px ${p.left}px`;
    }

    // ── Margin ────────────────────────────────────────────
    if (element.margin) {
      const m = element.margin;
      style['margin'] = `${m.top}px ${m.right}px ${m.bottom}px ${m.left}px`;
    }

    // Flex/grid child properties are applied in buildStyle (where parent is available).

    // ── Transform ─────────────────────────────────────────
    const transform = buildCanvasElementTransform(element);
    if (transform) style['transform'] = transform;
    const transformOrigin = buildCanvasElementTransformOrigin(element);
    if (transformOrigin) style['transform-origin'] = transformOrigin;
    const backfaceVisibility = buildCanvasElementBackfaceVisibility(element);
    if (backfaceVisibility) style['backface-visibility'] = backfaceVisibility;
    const transformStyle = buildCanvasElementTransformStyle(element);
    if (transformStyle) style['transform-style'] = transformStyle;

    // ── CSS Filters ───────────────────────────────────────
    const filterOptions = element.cssFilterOptions;
    if (filterOptions && filterOptions.length > 0) {
      const filterParts: string[] = [];
      if (filterOptions.includes('blur') && element.filterBlur != null)
        filterParts.push(`blur(${element.filterBlur}px)`);
      if (filterOptions.includes('brightness') && element.filterBrightness != null)
        filterParts.push(`brightness(${element.filterBrightness}%)`);
      if (filterOptions.includes('contrast') && element.filterContrast != null)
        filterParts.push(`contrast(${element.filterContrast}%)`);
      if (filterOptions.includes('grayscale') && element.filterGrayscale != null)
        filterParts.push(`grayscale(${element.filterGrayscale}%)`);
      if (filterOptions.includes('hueRotate') && element.filterHueRotate != null)
        filterParts.push(`hue-rotate(${element.filterHueRotate}deg)`);
      if (filterOptions.includes('invert') && element.filterInvert != null)
        filterParts.push(`invert(${element.filterInvert}%)`);
      if (filterOptions.includes('saturate') && element.filterSaturate != null)
        filterParts.push(`saturate(${element.filterSaturate}%)`);
      if (filterOptions.includes('sepia') && element.filterSepia != null)
        filterParts.push(`sepia(${element.filterSepia}%)`);
      if (filterParts.length > 0) {
        style['filter'] = filterParts.join(' ');
      }
      if (filterOptions.includes('backdropBlur') && element.filterBackdropBlur != null) {
        style['backdrop-filter'] = `blur(${element.filterBackdropBlur}px)`;
      }
    }

    // ── Text color ────────────────────────────────────────
    if (element.type === 'text' && element.fill) {
      style['color'] = element.fill;
    }

    // ── Cursor ────────────────────────────────────────────
    if (element.cursor) {
      style['cursor'] = element.cursor;
    }

    return style;
  }

  /**
   * Applies flex-grow / flex-shrink / align-self correctly based on the parent
   * flex container's main axis, so fill mode is respected per-axis.
   * Only relevant when the element is a flow child inside a flex parent.
   */
  private buildFlexChildStyle(
    element: CanvasElement,
    parent: CanvasElement | null | undefined,
  ): DomStyleMap {
    const pos = element.position;
    const isFlow = !pos || pos === 'static' || pos === 'relative' || pos === 'sticky';
    if (!isFlow || parent?.display !== 'flex') return {};

    const style: DomStyleMap = {};
    const dir = parent.flexDirection;
    const mainIsWidth = dir !== 'column' && dir !== 'column-reverse';
    const mainFill = mainIsWidth ? element.widthMode === 'fill' : element.heightMode === 'fill';
    const crossFill = mainIsWidth ? element.heightMode === 'fill' : element.widthMode === 'fill';

    if (mainFill) {
      // Grow to fill available main-axis space; allow shrinking when multiple fill children share it.
      style['flex-grow'] = '1';
      style['flex-shrink'] = '1';
      // Prevent flex from compressing below 0 (width or height already set to resolved value).
      if (mainIsWidth) style['min-width'] = '0';
      else style['min-height'] = '0';
    } else {
      // Fixed or fit-content on main axis — must NOT be shrunk by flex layout.
      style['flex-shrink'] = '0';
    }

    if (crossFill) {
      // Stretch across the cross axis instead of relying solely on the resolved pixel value.
      style['align-self'] = 'stretch';
    }

    return style;
  }

  private buildPositionStyle(
    element: CanvasElement,
    parent: CanvasElement | null | undefined,
  ): DomStyleMap {
    const pos = element.position;
    const isFlowPosition = !pos || pos === 'static' || pos === 'relative' || pos === 'sticky';

    // Only treat as a flow child when the parent has layout (display) enabled.
    // Root elements (no parent) and children of non-layout containers are always
    // positioned absolutely using their stored x/y.
    if (isFlowPosition && parent?.display) {
      // Let flex/grid control layout; 'relative' is neutral and allows z-index if needed.
      return { position: 'relative' };
    }

    const effectivePos = pos === 'fixed' ? 'fixed' : 'absolute';
    const style: DomStyleMap = { position: effectivePos };
    style['left'] = `${element.x}px`;
    style['top'] = `${element.y}px`;
    return style;
  }

  buildTextContentStyle(element: CanvasElement): DomStyleMap {
    const lineHeightValue =
      element.lineHeight != null
        ? element.lineHeightUnit === 'px'
          ? `${element.lineHeight}px`
          : String(element.lineHeight)
        : '1.2';

    const letterSpacingValue =
      element.letterSpacing != null
        ? element.letterSpacingUnit === 'em'
          ? `${element.letterSpacing}em`
          : `${element.letterSpacing}px`
        : null;

    return {
      'font-family': element.fontFamily ?? 'Inter, sans-serif',
      'font-size':
        element.fontSize != null ? `${element.fontSize}${element.fontSizeUnit ?? 'px'}` : '16px',
      'font-weight': String(element.fontWeight ?? 400),
      'font-style': element.fontStyle ?? 'normal',
      'text-align': element.textAlign ?? 'left',
      'line-height': lineHeightValue,
      'letter-spacing': letterSpacingValue,
      'white-space': 'pre-wrap',
      'word-break': 'break-word',
    };
  }

  buildTextVerticalAlignStyle(element: CanvasElement): DomStyleMap {
    const va = element.textVerticalAlign ?? 'top';
    const justifyContent = va === 'middle' ? 'center' : va === 'bottom' ? 'flex-end' : 'flex-start';
    return {
      display: 'flex',
      'flex-direction': 'column',
      'align-items': 'stretch',
      'justify-content': justifyContent,
      width: '100%',
      height: '100%',
    };
  }
}
