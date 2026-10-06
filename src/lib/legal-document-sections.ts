/**
 * Presentation-only split of a legal paragraph into its lead-in heading and body.
 *
 * Every legal paragraph opens with a short noun-phrase lead-in followed by a full stop
 * ("Accounts and roles. SkillMatch has ..."). The reader gets that lead-in as a section heading
 * and the rest as the body. No words are added, removed or reordered: `${heading}. ${body}` is the
 * original paragraph. A paragraph without a short lead-in (a continuation) is returned as body only.
 */
export type LegalSection = { heading: string | null; body: string };

const MAX_LEAD_IN_LENGTH = 48;

export function toLegalSection(paragraph: string): LegalSection {
  const stop = paragraph.indexOf('. ');
  if (stop > 0 && stop <= MAX_LEAD_IN_LENGTH) {
    const heading = paragraph.slice(0, stop);
    const body = paragraph.slice(stop + 2);
    if (body.length > 0 && !/[:;,]$/.test(heading)) return { heading, body };
  }
  return { heading: null, body: paragraph };
}

export function toLegalSections(paragraphs: readonly string[]): LegalSection[] {
  return paragraphs.map(toLegalSection);
}
