import { supabase } from './supabase';

/**
 * SKL-02 (owner, 2026-11-06): a Worker's skills show as pills with a dot in the skill's catalog-category
 * colour, grouped by category. The four colours are the validated Admin chart hues; the order is the
 * order the categories are grouped in. A skill outside these categories gets the neutral dot.
 */
export const SKILL_CATEGORY_COLORS: Record<string, string> = {
  'Home repair & construction': '#3987e5',
  'Household services': '#1baf7a',
  'Care & personal services': '#6250d6',
  'Appliance & vehicle': '#eda100',
};
export const UNKNOWN_SKILL_COLOR = '#b4b3c0';

const CATEGORY_ORDER = Object.keys(SKILL_CATEGORY_COLORS);

export type SkillChipItem = { name: string; category: string | null; color: string };

/** The pills for these skills: grouped by category in a fixed order, names A to Z; given order until known. */
export function skillChipItems(skills: readonly string[], categories: ReadonlyMap<string, string> | null): SkillChipItem[] {
  const items = skills.map((name): SkillChipItem => {
    const category = categories?.get(name) ?? null;
    const color = category === null ? UNKNOWN_SKILL_COLOR : SKILL_CATEGORY_COLORS[category] ?? UNKNOWN_SKILL_COLOR;
    return { name, category, color };
  });
  if (categories === null) return items;
  const rank = (item: SkillChipItem) => {
    const index = item.category === null ? -1 : CATEGORY_ORDER.indexOf(item.category);
    return index < 0 ? CATEGORY_ORDER.length : index;
  };
  return [...items].sort((left, right) => rank(left) - rank(right) || left.name.localeCompare(right.name));
}

let cached: Promise<Map<string, string>> | null = null;

/** Each catalog skill's category, read once per app session (the catalog is small and the same for everyone). */
export function loadSkillCategories(): Promise<Map<string, string>> {
  if (cached === null) {
    const read = readCatalog();
    cached = read;
    read.catch(() => { if (cached === read) cached = null; });
  }
  return cached;
}

async function readCatalog(): Promise<Map<string, string>> {
  const { data, error } = await supabase.from('skills').select('skill_name, category');
  if (error) throw new Error('Skill categories could not be loaded.');
  const rows = Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
  return new Map(rows
    .filter((row) => typeof row.skill_name === 'string' && typeof row.category === 'string')
    .map((row) => [row.skill_name as string, row.category as string]));
}
