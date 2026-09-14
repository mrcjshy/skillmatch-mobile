export type CatalogSkill = { id: string; skill_name: string };

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
