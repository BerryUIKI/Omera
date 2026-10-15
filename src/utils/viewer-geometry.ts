export interface Size { width: number; height: number }
export interface Translation { x: number; y: number }

/** Fit without upscaling; zoom counts physical display pixels per image pixel. */
export function fitImageScale(image: Size, viewport: Size, pixelRatio = 1, padding = 48): number {
  if (![image.width, image.height, viewport.width, viewport.height, pixelRatio].every(value => Number.isFinite(value) && value > 0)) return 1;
  return Math.min(1, Math.max(1, viewport.width - padding) / image.width * pixelRatio,
    Math.max(1, viewport.height - padding) / image.height * pixelRatio);
}

export function clampViewerScale(scale: number): number {
  return Number.isFinite(scale) ? Math.max(0.001, Math.min(8, scale)) : 1;
}

/** Keep the image point under the cursor stationary while zooming. */
export function zoomTranslation(current: Translation, point: Translation, oldScale: number, newScale: number): Translation {
  if (oldScale <= 0 || !Number.isFinite(oldScale)) return current;
  const ratio = newScale / oldScale;
  return { x: point.x - (point.x - current.x) * ratio, y: point.y - (point.y - current.y) * ratio };
}
