import { describe, expect, it } from 'vitest';

import { mergeRecentLocation, type RecentLocation } from './recent-locations';

const place = (index: number): RecentLocation => ({
  pin: { latitude: 14.54 + index / 1000, longitude: 121.07 + index / 1000 },
  address: `Place ${index}`,
  timestamp: index,
});

describe('recent confirmed locations', () => {
  it('keeps most recent first, caps five, and deduplicates nearby pins', () => {
    let rows: RecentLocation[] = [];
    for (let index = 0; index < 6; index += 1) rows = mergeRecentLocation(rows, place(index));
    expect(rows.map((row) => row.address)).toEqual(['Place 5', 'Place 4', 'Place 3', 'Place 2', 'Place 1']);
    rows = mergeRecentLocation(rows, { ...place(5), address: 'Updated', timestamp: 10 });
    expect(rows[0].address).toBe('Updated');
    expect(rows).toHaveLength(5);
  });
});
