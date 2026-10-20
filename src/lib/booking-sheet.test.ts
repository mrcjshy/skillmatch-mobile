import { describe, expect, it } from 'vitest';

import { clampOffset, isPanelDrag, mapInsetsForPanel, sheetGeometry, snapPanel } from './booking-sheet';

describe('booking panel geometry', () => {
  it('reserves the floating header and shows only the measured collapsed part', () => {
    expect(sheetGeometry({ containerHeight: 900, topReserve: 88, collapsedHeight: 260 })).toEqual({ sheetHeight: 812, collapsedOffset: 552 });
  });

  it('never hides more than the sheet when large text makes the collapsed part taller than the sheet', () => {
    expect(sheetGeometry({ containerHeight: 400, topReserve: 88, collapsedHeight: 500 })).toEqual({ sheetHeight: 312, collapsedOffset: 0 });
    expect(sheetGeometry({ containerHeight: 0, topReserve: 88, collapsedHeight: 260 })).toEqual({ sheetHeight: 0, collapsedOffset: 0 });
  });

  it('frames map markers between the floating header and the collapsed panel', () => {
    expect(mapInsetsForPanel({ headerBottom: 88.4, collapsedHeight: 260.6 })).toEqual({ top: 88, bottom: 261 });
    expect(mapInsetsForPanel({ headerBottom: -1, collapsedHeight: 0 })).toEqual({ top: 0, bottom: 0 });
  });
});

describe('booking panel drag', () => {
  it('treats only a clearly vertical move as a panel drag (taps and sideways map pans are not)', () => {
    expect(isPanelDrag(0, 4)).toBe(false);
    expect(isPanelDrag(40, 20)).toBe(false);
    expect(isPanelDrag(4, -30)).toBe(true);
    expect(isPanelDrag(0, 30)).toBe(true);
  });

  it('a flick decides by direction; otherwise the nearer position wins', () => {
    const collapsedOffset = 500;
    expect(snapPanel({ from: 'collapsed', dy: -20, vy: -0.8, collapsedOffset })).toBe('expanded');
    expect(snapPanel({ from: 'expanded', dy: 20, vy: 0.9, collapsedOffset })).toBe('collapsed');
    expect(snapPanel({ from: 'collapsed', dy: -300, vy: 0, collapsedOffset })).toBe('expanded');
    expect(snapPanel({ from: 'collapsed', dy: -100, vy: 0, collapsedOffset })).toBe('collapsed');
    expect(snapPanel({ from: 'expanded', dy: 200, vy: 0, collapsedOffset })).toBe('expanded');
    expect(snapPanel({ from: 'expanded', dy: 300, vy: 0, collapsedOffset })).toBe('collapsed');
  });

  it('keeps the panel between its two positions while dragging', () => {
    expect(clampOffset(-50, 500)).toBe(0);
    expect(clampOffset(700, 500)).toBe(500);
    expect(clampOffset(250, 500)).toBe(250);
  });
});
