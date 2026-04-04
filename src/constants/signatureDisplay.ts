/**
 * Single source of truth for signature crop/export and document display.
 * Keep server/middleware/upload.js signature transformation aligned with EXPORT_*.
 */

/** Crop area aspect width / height (wide signature strip). */
export const SIGNATURE_ASPECT = 3 / 1;

/** Pixel size of the PNG uploaded to the server (3:1). */
export const SIGNATURE_EXPORT_WIDTH = 600;
export const SIGNATURE_EXPORT_HEIGHT = 200;

/** Max CSS size in generated documents (keep ~3:1). */
export const SIGNATURE_CSS_MAX_WIDTH_PX = 280;
export const SIGNATURE_CSS_MAX_HEIGHT_PX = 94;

/** Tailwind-friendly max dimensions for settings preview (matches documents). */
export const SIGNATURE_PREVIEW_MAX_WIDTH_CLASS = "max-w-[280px]";
export const SIGNATURE_PREVIEW_MAX_HEIGHT_CLASS = "max-h-[94px]";
