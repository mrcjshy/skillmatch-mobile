/**
 * Geometry and snapping for the Booking Details panel that sits over the
 * full-screen booking map. Pure so the drag rules can be tested; the component
 * only feeds it measurements and gesture deltas.
 *
 * Two positions: `collapsed` (handle + concise summary + location controls,
 * most of the map visible) and `expanded` (the full booking, below the floating
 * header so Back stays reachable). Translation 0 = expanded.
 */

export type SheetPosition = 'collapsed' | 'expanded';

export type SheetGeometry = {
  /** Height of the sheet itself (container minus the reserved top area). */
  sheetHeight: number;
  /** translateY that shows only the collapsed part. */
  collapsedOffset: number;
};

export function sheetGeometry({ containerHeight, topReserve, collapsedHeight }: {
  containerHeight: number; topReserve: number; collapsedHeight: number;
}): SheetGeometry {
  const sheetHeight = Math.max(0, containerHeight - topReserve);
  const visible = Math.min(sheetHeight, Math.max(0, collapsedHeight));
  return { sheetHeight, collapsedOffset: sheetHeight - visible };
}

/** A drag belongs to the panel only when it is clearly vertical; taps and sideways moves do not. */
export function isPanelDrag(dx: number, dy: number): boolean {
  return Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx) * 1.2;
}

const FLICK_VELOCITY = 0.5;

/**
 * Where a drag ends: a flick decides by direction, otherwise the nearer
 * position. `dy` and `vy` are positive downwards.
 */
export function snapPanel({ from, dy, vy, collapsedOffset }: {
  from: SheetPosition; dy: number; vy: number; collapsedOffset: number;
}): SheetPosition {
  if (vy <= -FLICK_VELOCITY) return 'expanded';
  if (vy >= FLICK_VELOCITY) return 'collapsed';
  const start = from === 'expanded' ? 0 : collapsedOffset;
  const end = clampOffset(start + dy, collapsedOffset);
  return end < collapsedOffset / 2 ? 'expanded' : 'collapsed';
}

export function clampOffset(offset: number, collapsedOffset: number): number {
  return Math.min(Math.max(0, offset), Math.max(0, collapsedOffset));
}

/** Map camera insets so markers are framed in the part of the map above the collapsed panel. */
export function mapInsetsForPanel({ headerBottom, collapsedHeight }: { headerBottom: number; collapsedHeight: number }) {
  return { top: Math.max(0, Math.round(headerBottom)), bottom: Math.max(0, Math.round(collapsedHeight)) };
}
