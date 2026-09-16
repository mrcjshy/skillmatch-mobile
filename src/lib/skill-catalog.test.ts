import { describe, expect, it } from 'vitest';

import {
  copySkillSelection,
  filterSkills,
  hasSkillSelectionChanged,
  normalizeSearchQuery,
  selectedCatalogSkills,
  toggleSkillInSelection,
} from './skill-catalog';

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

const PLUMBING = 'c7f7a879-6a4c-49fa-b9f0-544a8b60b88e';
const CARPENTRY = 'ac36af46-4c0c-4c6e-a5a7-4ae375521913';

describe('hasSkillSelectionChanged', () => {
  it('is false when the same skill ids and proficiency values are present', () => {
    expect(
      hasSkillSelectionChanged(
        { [PLUMBING]: 'expert', [CARPENTRY]: 'beginner' },
        { [PLUMBING]: 'expert', [CARPENTRY]: 'beginner' }
      )
    ).toBe(false);
  });

  it('is false when only object key insertion order differs', () => {
    expect(
      hasSkillSelectionChanged(
        { [PLUMBING]: 'expert', [CARPENTRY]: 'beginner' },
        { [CARPENTRY]: 'beginner', [PLUMBING]: 'expert' }
      )
    ).toBe(false);
  });

  it('is true when a skill is added', () => {
    expect(
      hasSkillSelectionChanged({ [PLUMBING]: 'beginner', [CARPENTRY]: 'beginner' }, { [PLUMBING]: 'beginner' })
    ).toBe(true);
  });

  it('is true when a skill is removed', () => {
    expect(
      hasSkillSelectionChanged({ [PLUMBING]: 'beginner' }, { [PLUMBING]: 'beginner', [CARPENTRY]: 'beginner' })
    ).toBe(true);
  });

  it('is true when removing every skill', () => {
    expect(hasSkillSelectionChanged({}, { [PLUMBING]: 'beginner' })).toBe(true);
  });

  it('is true when proficiency changes for the same skill_id', () => {
    expect(hasSkillSelectionChanged({ [PLUMBING]: 'expert' }, { [PLUMBING]: 'beginner' })).toBe(true);
  });

  it('compares by skill_id, not by display name', () => {
    const sameNameDifferentId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    expect(
      hasSkillSelectionChanged({ [sameNameDifferentId]: 'beginner' }, { [PLUMBING]: 'beginner' })
    ).toBe(true);
  });
});

describe('modal working selection', () => {
  it('copies a snapshot so later toggles do not mutate the Profile draft', () => {
    const draft = { [PLUMBING]: 'expert' };
    const working = copySkillSelection(draft);
    const afterAdd = toggleSkillInSelection(working, CARPENTRY);
    expect(draft).toEqual({ [PLUMBING]: 'expert' });
    expect(working).toEqual({ [PLUMBING]: 'expert' });
    expect(afterAdd).toEqual({ [PLUMBING]: 'expert', [CARPENTRY]: 'beginner' });
  });

  it('adds a new skill as beginner and can remove it again', () => {
    const added = toggleSkillInSelection({}, PLUMBING);
    expect(added).toEqual({ [PLUMBING]: 'beginner' });
    expect(toggleSkillInSelection(added, PLUMBING)).toEqual({});
  });

  it('Cancel keeps the original draft; Done uses the working snapshot', () => {
    const draft = { [PLUMBING]: 'intermediate' };
    const working = toggleSkillInSelection(copySkillSelection(draft), CARPENTRY);
    const cancelled = draft;
    const done = working;
    expect(cancelled).toEqual({ [PLUMBING]: 'intermediate' });
    expect(done).toEqual({ [PLUMBING]: 'intermediate', [CARPENTRY]: 'beginner' });
    expect(hasSkillSelectionChanged(done, draft)).toBe(true);
    expect(hasSkillSelectionChanged(cancelled, draft)).toBe(false);
  });
});

describe('selectedCatalogSkills', () => {
  it('returns selected catalog rows by skill_id, ignoring name collisions', () => {
    const catalog = [
      { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', skill_name: 'Plumbing' },
      { id: PLUMBING, skill_name: 'Plumbing' },
    ];
    expect(selectedCatalogSkills(catalog, [PLUMBING]).map((skill) => skill.id)).toEqual([PLUMBING]);
  });

  it('keeps selected rows in catalog name/id order even when ids were added in another order', () => {
    expect(selectedCatalogSkills(CATALOG, [PLUMBING, CARPENTRY]).map((skill) => skill.skill_name)).toEqual([
      'Carpentry',
      'Plumbing',
    ]);
  });
});
