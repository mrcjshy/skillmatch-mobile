import { describe, expect, it, vi } from 'vitest';

vi.mock('@/components/ContactFileStack', () => ({}));
vi.mock('@/lib/portfolio', () => ({ projectScaleLabel: (s: string) => ({ small: 'Small', medium: 'Medium', large: 'Large' })[s] }));

import { FILE_ROWS, portfolioFilesCopy } from './portfolio-files';

const item = (title: string, images: (string | null)[] = []) => ({
  id: title, workerId: 'w', title, description: 'Fixed the sink', projectScale: 'medium' as const, createdAt: null,
  images: images.map((signedUrl, i) => ({ id: `${title}${i}`, portfolioItemId: title, storagePath: 'p', position: i, createdAt: null, signedUrl })),
});

describe('Worker portfolio as the Contact File Stack', () => {
  it('labels folders with project titles and leaves the rest of the fourteen blank', () => {
    const copy = portfolioFilesCopy([item('Kitchen sink'), item('Gate repaint')], 'Juan');
    expect(copy.names).toHaveLength(FILE_ROWS);
    expect(copy.names.slice(0, 3)).toEqual(['Kitchen sink', 'Gate repaint', '']);
    expect(copy.selectedName).toBe('Juan');
    expect(copy.hint).toBe('2 PROJECTS / ONE PLACE');
  });

  it('fills three cards from the newest projects and the prints from real photos', () => {
    const copy = portfolioFilesCopy([item('Kitchen sink', [null, 'https://a']), item('Gate', ['https://b'])], '');
    expect(copy.cards[0]).toEqual({ title: 'Kitchen sink', line: 'Medium · Fixed the sink', footer: 'SkillMatch · My work' });
    expect(copy.cards[2].line).toBe('Add another project to your portfolio');
    expect(copy.prints).toEqual(['https://a', 'https://b']);
  });
});
