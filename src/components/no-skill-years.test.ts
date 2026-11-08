// @ts-expect-error -- Node-only source guard.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Owner direction 2026-11-06 (REG-03): years of experience are removed from every surface, as skill
 * levels were on 2026-11-05. Workers are not asked for them, and no Worker, Client or Admin screen,
 * nor the resume PDF, shows them. worker_skills.years_experience stays in the database (optional
 * since REG-03); the app neither reads nor writes it.
 */
const code = (file: string) => readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');

const SURFACES = [
  'src/components/profile-details-form.tsx',
  'src/components/admin-account-profile-section.tsx',
  'src/components/resume-builder.tsx',
  'src/lib/resume.ts',
  'src/app/(auth)/register.tsx',
];

function appSources(dir: string): string[] {
  return readdirSync(dir).flatMap((name: string) => {
    const path = `${dir}/${name}`;
    if (statSync(path).isDirectory()) return appSources(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

describe('No years of experience on any surface', () => {
  it.each(SURFACES)('%s neither asks for nor prints years of experience', (file) => {
    const source = code(file);
    expect(source).not.toMatch(/Years of|years of experience|skills with years|Skills and experience/i);
    expect(source).not.toMatch(/formatYears|\$\{[^}]*\} years|'1 year'/);
  });

  it.each(['src/components/admin-account-profile-section.tsx', 'src/components/resume-builder.tsx', 'src/lib/resume.ts'])(
    '%s uses no skill years at all', (file) => {
      expect(code(file)).not.toMatch(/\.years\b/);
    });

  it('no app code reads or writes worker_skills.years_experience', () => {
    const readers = appSources('src').filter((file) => /years_experience/.test(code(file)));
    expect(readers).toEqual([]);
  });
});
