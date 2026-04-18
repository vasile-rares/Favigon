import { CanvasElement } from '@app/core';

const DEFAULT_TEXT_FONT_SIZE = 16;
const ROOT_FONT_SIZE_PX = 16;

export function getTextFontFamily(element: CanvasElement): string {
  return element.fontFamily ?? 'Inter';
}

export function getTextFontWeight(element: CanvasElement): number {
  return element.fontWeight ?? 400;
}

export function getTextFontStyle(element: CanvasElement): string {
  return element.fontStyle ?? 'normal';
}

export function getTextFontSize(element: CanvasElement): string {
  return formatTextMetricValue(
    element.fontSize,
    element.fontSizeUnit ?? 'px',
    DEFAULT_TEXT_FONT_SIZE,
  );
}

export function getTextLineHeight(element: CanvasElement): string {
  return formatTextMetricValue(element.lineHeight, element.lineHeightUnit ?? 'em', 1.2);
}

export function getTextLetterSpacing(element: CanvasElement): string {
  return formatTextMetricValue(element.letterSpacing, element.letterSpacingUnit ?? 'px', 0);
}

export function getTextFontSizeInPixels(element: CanvasElement): number {
  const fontSize = Number.isFinite(element.fontSize ?? Number.NaN)
    ? (element.fontSize as number)
    : DEFAULT_TEXT_FONT_SIZE;

  return (element.fontSizeUnit ?? 'px') === 'rem' ? fontSize * ROOT_FONT_SIZE_PX : fontSize;
}

export function getTextJustifyContent(element: CanvasElement): string {
  switch (element.textAlign) {
    case 'left':
      return 'flex-start';
    case 'right':
      return 'flex-end';
    default:
      return 'center';
  }
}

export function getTextAlignItems(element: CanvasElement): string {
  switch (element.textVerticalAlign) {
    case 'top':
      return 'flex-start';
    case 'bottom':
      return 'flex-end';
    default:
      return 'center';
  }
}

export function getTextAlignValue(element: CanvasElement): string {
  return element.textAlign ?? 'center';
}

export function getFrameTitle(element: CanvasElement): string {
  const name = element.name?.trim() || 'Frame';
  const primary = element.isPrimary ? ' · Primary' : '';
  return `${name}${primary}  ${Math.round(element.width)} × ${Math.round(element.height)}`;
}

function formatTextMetricValue(
  value: number | undefined,
  unit: 'px' | 'rem' | 'em',
  fallback: number,
): string {
  const normalizedValue = Number.isFinite(value ?? Number.NaN) ? (value as number) : fallback;
  return `${normalizedValue}${unit}`;
}
