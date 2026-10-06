/**
 * Post job skill choice as one ordered list of at most two skills. The draft and the posting
 * payload keep their existing shape (one primary skill id plus additional skill ids); this only
 * decides which id sits where when the Client taps a skill in the single picker.
 */
export type PostJobSkillSelection = { primarySkillId: string | null; additionalSkillIds: readonly string[] };
export type PostJobSkillRole = 'Primary' | 'Secondary';

/** A job names a primary skill and at most one secondary skill. */
export const MAX_POST_JOB_SKILLS = 2;

/** Selected ids in the order they were chosen: the primary first, then the secondary, each once. */
export function orderedPostJobSkillIds(selection: PostJobSkillSelection): string[] {
  const ordered: string[] = [];
  for (const id of [selection.primarySkillId, ...selection.additionalSkillIds]) {
    if (id !== null && !ordered.includes(id) && ordered.length < MAX_POST_JOB_SKILLS) ordered.push(id);
  }
  return ordered;
}

/** False once both places are taken, so a third unselected skill cannot be added. */
export function canAddPostJobSkill(selection: PostJobSkillSelection, skillId: string): boolean {
  const ordered = orderedPostJobSkillIds(selection);
  return ordered.includes(skillId) || ordered.length < MAX_POST_JOB_SKILLS;
}

/**
 * Tapping an unselected skill adds it at the end, so the first tap is the primary and the second
 * the secondary; a third is ignored. Tapping a selected skill removes it; when that was the
 * primary, the secondary becomes the primary, so a job with any skill selected always has one.
 */
export function togglePostJobSkill(selection: PostJobSkillSelection, skillId: string): { primarySkillId: string | null; additionalSkillIds: string[] } {
  const ordered = orderedPostJobSkillIds(selection);
  const next = ordered.includes(skillId) ? ordered.filter(id => id !== skillId)
    : ordered.length < MAX_POST_JOB_SKILLS ? [...ordered, skillId] : ordered;
  return { primarySkillId: next[0] ?? null, additionalSkillIds: next.slice(1) };
}

export function postJobSkillRole(selection: PostJobSkillSelection, skillId: string): PostJobSkillRole | null {
  const index = orderedPostJobSkillIds(selection).indexOf(skillId);
  if (index < 0) return null;
  return index === 0 ? 'Primary' : 'Secondary';
}
