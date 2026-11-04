import type { FileCard } from '@/components/ContactFileStack';
import { projectScaleLabel, type PortfolioItem } from '@/lib/portfolio';

/** The File Stack always draws fourteen folders. */
export const FILE_ROWS = 14;

export type PortfolioFilesCopy = {
  header: string;
  names: string[];
  selectedName: string;
  cards: [FileCard, FileCard, FileCard];
  prints: [string | null, string | null];
  hint: string;
};

/**
 * Maps a Worker's own portfolio onto the Contact File Stack: folders are project titles (the rest
 * stay unlabelled), the opened file is the Worker's, its three cards are the newest projects and the
 * two prints are the first project photos (null keeps the block's own scenic print).
 */
export function portfolioFilesCopy(items: readonly PortfolioItem[], firstName: string): PortfolioFilesCopy {
  const owner = firstName.trim() || 'My work';
  const titles = items.map((item) => item.title.trim()).filter(Boolean);
  const names = Array.from({ length: FILE_ROWS }, (_, i) => titles[i] ?? '');
  const card = (item: PortfolioItem | undefined): FileCard => item
    ? {
      title: item.title.trim() || 'Project',
      line: [projectScaleLabel(item.projectScale), item.description?.trim()].filter(Boolean).join(' · '),
      footer: `SkillMatch · ${owner}`,
    }
    : { title: owner, line: 'Add another project to your portfolio', footer: 'SkillMatch' };
  const photos = items.flatMap((item) => item.images.map((image) => image.signedUrl)).filter((url): url is string => !!url);
  const count = items.length;
  return {
    header: 'portfolio files',
    names,
    selectedName: owner,
    cards: [card(items[0]), card(items[1]), card(items[2])],
    prints: [photos[0] ?? null, photos[1] ?? null],
    hint: `${count} ${count === 1 ? 'PROJECT' : 'PROJECTS'} / ONE PLACE`,
  };
}
