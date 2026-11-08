// @ts-expect-error -- Node-only source guard.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Owner direction 2026-11-05: skill levels (Beginner / Intermediate / Expert) are removed from every
 * surface: Worker (editing and resume), Client and Worker views, and native Admin. Years of experience
 * followed on 2026-11-06 (no-skill-years.test.ts). The worker_skills.proficiency_level column keeps its
 * default and is read only for parsing;
 * no screen or document may print it.
 */
const code = (file: string) => readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');

const SURFACES = [
  'src/app/(worker)/(tabs)/worker/profile.tsx',
  'src/components/resume-builder.tsx',
  'src/components/skill-gap.tsx',
  'src/components/admin-account-profile-section.tsx',
  'src/components/selected-skill-chips.tsx',
];

describe('No skill level on any surface', () => {
  it.each(SURFACES)('%s prints no skill level and offers no level control', (file) => {
    const source = code(file);
    expect(source).not.toMatch(/PROFICIENCY_OPTIONS|PROFICIENCY_LABEL|PROFICIENCY\b/);
    expect(source).not.toMatch(/\.proficiency\b/);
    expect(source).not.toMatch(/['"`](Beginner|Intermediate|Expert)['"`]/);
  });

  it('the resume PDF prints no skill level', () => {
    const source = code('src/lib/resume.ts');
    expect(source).not.toMatch(/PROFICIENCY_LABEL/);
    expect(source).not.toMatch(/s\.proficiency === null \? null/);
  });
});
