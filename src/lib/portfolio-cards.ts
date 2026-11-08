import type { PortfolioCard } from '@/components/PortfolioCardStack';
import { projectScaleLabel, type PortfolioItem } from '@/lib/portfolio';

/**
 * The Worker's portfolio as the Portfolio Card Stack (owner 2026-11-06): one card per project,
 * newest first, nothing else. The stack's three colours repeat for more projects.
 */

/** The source block's three colours, top and bottom: amber, coral, mint. */
const COLOURS: readonly (readonly [string, string])[] = [['#f0bd2e', '#dba616'], ['#f58468', '#e5674a'], ['#86dcbb', '#62c79f']];
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

const two = (n: number) => String(n).padStart(2, '0');

/** "06 NOV 2026" in the phone's own time zone; a dash when the date is missing or unreadable. */
export function addedDate(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '—' : `${two(date.getDate())} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

export function portfolioCards(items: readonly PortfolioItem[]): PortfolioCard[] {
  const total = items.length;
  return items.map((item, index) => {
    const [color, deep] = COLOURS[index % COLOURS.length];
    const title = item.title.trim() || 'Project';
    const scale = `${projectScaleLabel(item.projectScale)} job`;
    const added = addedDate(item.createdAt);
    const photoCount = item.images.length;
    return {
      color,
      deep,
      title,
      scale,
      added,
      description: item.description?.trim() ?? '',
      photos: item.images.map((image) => image.signedUrl).filter((url): url is string => !!url),
      photoCount,
      number: two(index + 1),
      total: two(total),
      accessibilityLabel:
        `Project ${index + 1} of ${total}: ${title}. ${scale}, ${photoCount} ${photoCount === 1 ? 'photo' : 'photos'}, added ${added}. Double tap to open.`,
    };
  });
}
