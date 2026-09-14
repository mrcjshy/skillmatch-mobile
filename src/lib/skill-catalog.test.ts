import { describe, expect, it } from 'vitest';

import { filterSkills, normalizeSearchQuery } from './skill-catalog';

const CATALOG = [
  { id: 'ac36af46-4c0c-4c6e-a5a7-4ae375521913', skill_name: 'Carpentry' },
  { id: '42300aaf-611f-434b-b504-f6f47bafa14d', skill_name: 'Electrical Work' },
  { id: '90be7a80-35e1-49ba-a2c8-c4689212603f', skill_name: 'General Labor' },
  { id: 'c7f7a879-6a4c-49fa-b9f0-544a8b60b88e', skill_name: 'Plumbing' },
] as const;

describe('normalizeSearchQuery', () => {
  it('trims and lowercases a padded skill query', () => {
    expect(normalizeSearchQuery(' plumbing ')).toBe('plumbing');
  });

  it('treats whitespace-only input as empty', () => {
    expect(normalizeSearchQuery('   ')).toBe('');
  });
});

describe('filterSkills', () => {
  it('returns every skill when the query is empty', () => {
    expect(filterSkills(CATALOG, '').map((skill) => skill.skill_name)).toEqual([
      'Carpentry',
      'Electrical Work',
      'General Labor',
      'Plumbing',
    ]);
  });

  it('returns every skill when the query is only whitespace', () => {
    expect(filterSkills(CATALOG, '   ').map((skill) => skill.id)).toEqual([
      'ac36af46-4c0c-4c6e-a5a7-4ae375521913',
      '42300aaf-611f-434b-b504-f6f47bafa14d',
      '90be7a80-35e1-49ba-a2c8-c4689212603f',
      'c7f7a879-6a4c-49fa-b9f0-544a8b60b88e',
    ]);
  });

  it('matches a skill_name substring', () => {
    expect(filterSkills(CATALOG, 'plumb').map((skill) => skill.skill_name)).toEqual(['Plumbing']);
  });

  it('matches a skill_name substring without regard to case', () => {
    expect(filterSkills(CATALOG, 'PLUMB').map((skill) => skill.skill_name)).toEqual(['Plumbing']);
  });

  it('matches Electrical Work on the word work', () => {
    expect(filterSkills(CATALOG, 'work').map((skill) => skill.skill_name)).toEqual([
      'Electrical Work',
    ]);
  });

  it('returns no skills when nothing matches the name', () => {
    expect(filterSkills(CATALOG, 'xyz')).toEqual([]);
  });

  it('does not match a query that appears only in the skill id', () => {
    const skills = [
      { id: 'plumbing-hidden-id', skill_name: 'Carpentry' },
      { id: 'c7f7a879-6a4c-49fa-b9f0-544a8b60b88e', skill_name: 'Plumbing' },
    ];
    expect(filterSkills(skills, 'plumbing').map((skill) => skill.skill_name)).toEqual(['Plumbing']);
  });

  it('orders by skill_name using code-unit comparison, not input order', () => {
    const reversed = [...CATALOG].reverse();
    expect(filterSkills(reversed, '').map((skill) => skill.skill_name)).toEqual([
      'Carpentry',
      'Electrical Work',
      'General Labor',
      'Plumbing',
    ]);
  });

  it('breaks equal skill_name ties by id', () => {
    const skills = [
      { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', skill_name: 'Labor' },
      { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', skill_name: 'Labor' },
    ];
    expect(filterSkills(skills, '').map((skill) => skill.id)).toEqual([
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    ]);
  });
});
