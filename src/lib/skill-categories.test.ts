import { describe, expect, it, vi } from 'vitest';

import { supabase } from './supabase';
import { SKILL_CATEGORY_COLORS, UNKNOWN_SKILL_COLOR, loadSkillCategories, skillChipItems } from './skill-categories';

vi.mock('./supabase', () => ({ supabase: { from: vi.fn() } }));
const from = vi.mocked(supabase.from);

const HOME = 'Home repair & construction', HOUSE = 'Household services', CARE = 'Care & personal services', VEHICLE = 'Appliance & vehicle';
const catalog = new Map([['Plumbing', HOME], ['Carpentry', HOME], ['House Cleaning', HOUSE], ['Caregiving', CARE], ['Driving', VEHICLE]]);

describe('SKL-02 skill chips (owner, 2026-11-06)', () => {
  it('colours each skill by its catalog category, groups the categories in a fixed order and sorts names inside', () => {
    expect(skillChipItems(['Driving', 'Plumbing', 'Caregiving', 'House Cleaning', 'Carpentry', 'Stargazing'], catalog)).toEqual([
      { name: 'Carpentry', category: HOME, color: SKILL_CATEGORY_COLORS[HOME] },
      { name: 'Plumbing', category: HOME, color: SKILL_CATEGORY_COLORS[HOME] },
      { name: 'House Cleaning', category: HOUSE, color: SKILL_CATEGORY_COLORS[HOUSE] },
      { name: 'Caregiving', category: CARE, color: SKILL_CATEGORY_COLORS[CARE] },
      { name: 'Driving', category: VEHICLE, color: SKILL_CATEGORY_COLORS[VEHICLE] },
      { name: 'Stargazing', category: null, color: UNKNOWN_SKILL_COLOR },
    ]);
  });

  it('keeps the given order with neutral dots until the catalog is known', () => {
    expect(skillChipItems(['Plumbing', 'Caregiving'], null)).toEqual([
      { name: 'Plumbing', category: null, color: UNKNOWN_SKILL_COLOR },
      { name: 'Caregiving', category: null, color: UNKNOWN_SKILL_COLOR },
    ]);
  });

  it('gives the four catalog categories four different colours, apart from the neutral dot', () => {
    expect(Object.keys(SKILL_CATEGORY_COLORS)).toEqual([HOME, HOUSE, CARE, VEHICLE]);
    expect(new Set([...Object.values(SKILL_CATEGORY_COLORS), UNKNOWN_SKILL_COLOR]).size).toBe(5);
  });

  it('reads the catalog once per session, ignores malformed rows and tries again after a failure', async () => {
    const select = vi.fn()
      .mockResolvedValueOnce({ data: null, error: { code: '503' } })
      .mockResolvedValueOnce({ data: [{ skill_name: 'Plumbing', category: HOME }, { skill_name: 7, category: 'x' }], error: null });
    from.mockReturnValue({ select } as never);
    await expect(loadSkillCategories()).rejects.toBeTruthy();
    await expect(loadSkillCategories()).resolves.toEqual(new Map([['Plumbing', HOME]]));
    await loadSkillCategories();
    expect(from).toHaveBeenCalledWith('skills');
    expect(select).toHaveBeenCalledWith('skill_name, category');
    expect(select).toHaveBeenCalledTimes(2);
  });
});
