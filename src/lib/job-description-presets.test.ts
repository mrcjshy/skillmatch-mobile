import { describe, expect, it } from 'vitest';
import { descriptionPresetsForSkill, hasUnfilledPresetBlank, PRESET_BLANK_TOKENS } from './job-description-presets';

// The 16 catalog IDs seeded by 20260916120000_v2c_db_01_skill_catalog_expansion.sql.
const CATALOG_IDS = [
  'c7f7a879-6a4c-49fa-b9f0-544a8b60b88e', '42300aaf-611f-434b-b504-f6f47bafa14d', 'ac36af46-4c0c-4c6e-a5a7-4ae375521913',
  '90be7a80-35e1-49ba-a2c8-c4689212603f', '58050052-cfa7-4e2b-8cd1-6e74f20d468f', '1f43e1d4-a443-4582-affd-a19c0617592f',
  '5a73f57b-f2d7-46c4-b774-7f8323d3c516', '9179ad4e-dc07-410a-aacf-6a2438dbc467', '57e6a000-a5ac-4cd9-b5de-1440ea03558e',
  '63b4db38-c7d4-415f-8e87-6e4e98506af8', 'f73ea827-3e32-44a9-98a2-4cb59978c83a', '45a65bb3-c7dc-4a7c-ae47-5db1ced919f4',
  '02be35a0-4c39-4f91-a684-93a3d5b54248', 'f2f28666-6ada-42a8-adf4-caf6e5c553c9', 'aab5b18c-de07-4de0-b888-464b3bd83913',
  '17e02f3a-1b75-428f-98a2-75bb9cfd13ae',
];

describe('description presets', () => {
  it('offers skill-specific presets for every seeded catalog skill and a generic fallback otherwise', () => {
    const generic = descriptionPresetsForSkill('00000000-0000-4000-8000-000000000000');
    expect(generic.length).toBeGreaterThan(0);
    for (const id of CATALOG_IDS) {
      const presets = descriptionPresetsForSkill(id);
      expect(presets.length).toBeGreaterThanOrEqual(2);
      expect(presets).not.toEqual(generic);
    }
    expect(descriptionPresetsForSkill(null)).toEqual([]);
  });

  it('never states a price, number, date, address or diagnosis, and always leaves a blank to fill', () => {
    const all = [...CATALOG_IDS.flatMap(descriptionPresetsForSkill), ...descriptionPresetsForSkill('unknown')];
    for (const preset of all) {
      expect(preset).not.toMatch(/\d|₱|php|peso|today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|street|barangay|caused by|because/i);
      expect(hasUnfilledPresetBlank(preset)).toBe(true);
      const withoutBlanks = PRESET_BLANK_TOKENS.reduce((text, token) => text.split(token).join(''), preset);
      expect(withoutBlanks).not.toMatch(/[[\]]/);
    }
  });

  it('detects only exact preset blanks', () => {
    for (const token of PRESET_BLANK_TOKENS) expect(hasUnfilledPresetBlank(`Text ${token}.`)).toBe(true);
    expect(hasUnfilledPresetBlank('Leak on the [2nd floor].')).toBe(false);
    expect(hasUnfilledPresetBlank('Leak at the kitchen sink.')).toBe(false);
  });
});
