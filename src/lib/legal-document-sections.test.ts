import { describe, expect, it } from 'vitest';

import { toLegalSection, toLegalSections } from './legal-document-sections';
import { PRIVACY_PARAGRAPHS, TERMS_PARAGRAPHS } from './legal-documents';

describe('legal document section split (presentation only)', () => {
  it('turns a short lead-in into a heading and keeps the rest as the body', () => {
    expect(toLegalSection('Bookings. After acceptance, both parties see a confirmed booking.')).toEqual({
      heading: 'Bookings',
      body: 'After acceptance, both parties see a confirmed booking.',
    });
  });

  it('leaves a paragraph without a short lead-in as body only', () => {
    const continuation = 'Creating a SkillMatch account does not by itself provide consent for unrelated research. It stays separate.';
    expect(toLegalSection(continuation)).toEqual({ heading: null, body: continuation });
    expect(toLegalSection('No full stop in this one')).toEqual({ heading: null, body: 'No full stop in this one' });
    expect(toLegalSection('Heading only. ')).toEqual({ heading: null, body: 'Heading only. ' });
  });

  it('never loses, adds or reorders a single word of either document', () => {
    for (const paragraphs of [TERMS_PARAGRAPHS, PRIVACY_PARAGRAPHS]) {
      const sections = toLegalSections(paragraphs);
      expect(sections).toHaveLength(paragraphs.length);
      sections.forEach((section, index) => {
        const rebuilt = section.heading === null ? section.body : `${section.heading}. ${section.body}`;
        expect(rebuilt).toBe(paragraphs[index]);
      });
    }
  });

  it('finds a heading for every authored section and treats only the research continuation as unheaded', () => {
    const terms = toLegalSections(TERMS_PARAGRAPHS);
    expect(terms.every((section) => section.heading !== null)).toBe(true);
    expect(terms.map((section) => section.heading).slice(0, 3)).toEqual(['About SkillMatch', 'Acceptance of these Terms', 'Accounts and roles']);
    const privacy = toLegalSections(PRIVACY_PARAGRAPHS);
    expect(privacy.filter((section) => section.heading === null)).toHaveLength(1);
    expect(privacy.find((section) => section.heading === null)?.body).toMatch(/^Creating a SkillMatch account/);
    for (const section of [...terms, ...privacy]) {
      if (section.heading !== null) expect(section.heading.length).toBeLessThanOrEqual(48);
    }
  });
});
