import { describe, expect, it, vi } from 'vitest';

import type { PortfolioItem } from './portfolio';
import { addedDate, portfolioCards } from './portfolio-cards';

// vi.mock is hoisted above the imports by Vitest.
vi.mock('@/components/PortfolioCardStack', () => ({}));
vi.mock('@/lib/portfolio', () => ({ projectScaleLabel: (s: string) => ({ small: 'Small', medium: 'Medium', large: 'Large' })[s] }));

const image = (n: number, url: string | null) => ({
  id: `img-${n}`, portfolioItemId: 'p', storagePath: `x/${n}.jpg`, position: n, createdAt: null, signedUrl: url,
});
const item = (title: string, extra: Partial<PortfolioItem> = {}): PortfolioItem => ({
  id: title, workerId: 'w', title, description: null, projectScale: 'small', createdAt: '2026-11-06T02:00:00Z', images: [], ...extra,
});

describe('portfolio as cards', () => {
  it('makes exactly one card per project, newest first, with no filler cards', () => {
    expect(portfolioCards([])).toEqual([]);
    expect(portfolioCards([item('Only one')])).toHaveLength(1);
    const cards = portfolioCards([
      item('Gpu repair', { description: '  Issue: no display. Replaced the capacitor.  ', images: [image(1, 'https://x/1'), image(2, null), image(3, 'https://x/3')] }),
      item('Gate repaint', { projectScale: 'medium' }),
    ]);
    expect(cards).toHaveLength(2);
    expect(cards[0]).toMatchObject({
      title: 'Gpu repair', scale: 'Small job', description: 'Issue: no display. Replaced the capacitor.',
      photos: ['https://x/1', 'https://x/3'], photoCount: 3, number: '01', total: '02', color: '#f0bd2e', deep: '#dba616',
    });
    expect(cards[0].accessibilityLabel).toBe(`Project 1 of 2: Gpu repair. Small job, 3 photos, added ${cards[0].added}. Double tap to open.`);
    expect(cards[1]).toMatchObject({ scale: 'Medium job', description: '', photos: [], photoCount: 0, number: '02', color: '#f58468' });
  });

  it('repeats the three colours for more projects', () => {
    const colours = portfolioCards(['a', 'b', 'c', 'd'].map((t) => item(t))).map((card) => card.color);
    expect(colours).toEqual(['#f0bd2e', '#f58468', '#86dcbb', '#f0bd2e']);
  });

  it('never shows a raw date and never an empty title', () => {
    expect(addedDate(null)).toBe('—');
    expect(addedDate('not a date')).toBe('—');
    expect(addedDate('2026-11-06T02:00:00Z')).toMatch(/^\d{2} (NOV|OCT|DEC) 2026$/);
    expect(portfolioCards([item('   ')])[0].title).toBe('Project');
  });
});
