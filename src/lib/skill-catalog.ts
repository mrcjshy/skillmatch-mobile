export type CatalogSkill = { id: string; skill_name: string };
export type SkillSelectionMap = Record<string, string>;

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function compareSkills(a: CatalogSkill, b: CatalogSkill): number {
  return compareText(a.skill_name, b.skill_name) || compareText(a.id, b.id);
}

export function normalizeSearchQuery(query: string): string {
  return query.trim().toLowerCase();
}

export function filterSkills<T extends CatalogSkill>(skills: readonly T[], query: string): T[] {
  const needle = normalizeSearchQuery(query);
  const matched =
    needle.length === 0
      ? [...skills]
      : skills.filter((skill) => skill.skill_name.toLowerCase().includes(needle));
  return matched.sort(compareSkills);
}

export function copySkillSelection(selection: SkillSelectionMap): SkillSelectionMap {
  return { ...selection };
}

export function toggleSkillInSelection(
  selection: SkillSelectionMap,
  skillId: string,
  defaultProficiency = 'beginner'
): SkillSelectionMap {
  const next = copySkillSelection(selection);
  if (Object.prototype.hasOwnProperty.call(next, skillId)) {
    delete next[skillId];
  } else {
    next[skillId] = defaultProficiency;
  }
  return next;
}

export function hasSkillSelectionChanged(
  current: SkillSelectionMap,
  persisted: SkillSelectionMap
): boolean {
  const currentIds = Object.keys(current);
  if (currentIds.length !== Object.keys(persisted).length) return true;
  for (const id of currentIds) {
    if (persisted[id] !== current[id]) return true;
  }
  return false;
}

export function selectedCatalogSkills<T extends CatalogSkill>(
  catalog: readonly T[],
  selectedIds: readonly string[]
): T[] {
  const wanted = new Set(selectedIds);
  return catalog.filter((skill) => wanted.has(skill.id)).sort(compareSkills);
}
