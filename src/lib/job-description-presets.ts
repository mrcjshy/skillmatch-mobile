/**
 * Deterministic, developer-written description starters. They contain only visible
 * blanks for facts the Client knows; never a price, date, address, scope or diagnosis.
 * Keyed by authoritative catalog skill ID (v2c_db_01 skill catalog migration).
 */

export const PRESET_BLANKS = {
  where: '[where in the house]',
  noticed: '[what you noticed]',
  item: '[which item]',
  size: '[how big or how many]',
} as const;

/** Exact blank tokens only; a Client's own brackets are never treated as blanks. */
export const PRESET_BLANK_TOKENS: readonly string[] = Object.values(PRESET_BLANKS);

const { where, noticed, item, size } = PRESET_BLANKS;

const GENERIC_PRESETS: readonly string[] = [
  `I need help with ${item} at ${where}. ${noticed}.`,
  `Work needed at ${where}: ${noticed}.`,
];

const PRESETS_BY_SKILL_ID: Readonly<Record<string, readonly string[]>> = {
  // Plumbing
  'c7f7a879-6a4c-49fa-b9f0-544a8b60b88e': [
    `There is a leak at ${where}. ${noticed}.`,
    `The ${item} at ${where} needs plumbing repair. ${noticed}.`,
  ],
  // Electrical Work
  '42300aaf-611f-434b-b504-f6f47bafa14d': [
    `The ${item} at ${where} needs electrical work. ${noticed}.`,
    `I need an outlet, switch or light checked at ${where}. ${noticed}.`,
  ],
  // Carpentry
  'ac36af46-4c0c-4c6e-a5a7-4ae375521913': [
    `The ${item} at ${where} needs carpentry repair. ${noticed}.`,
    `I need ${item} built or fixed at ${where}. Size: ${size}.`,
  ],
  // General Labor
  '90be7a80-35e1-49ba-a2c8-c4689212603f': [
    `I need help moving or carrying ${item} at ${where}. Amount: ${size}.`,
    `I need general help at ${where}: ${noticed}.`,
  ],
  // Masonry
  '58050052-cfa7-4e2b-8cd1-6e74f20d468f': [
    `The wall or concrete at ${where} needs masonry work. ${noticed}.`,
    `I need ${item} built or patched at ${where}. Size: ${size}.`,
  ],
  // Cooking
  '1f43e1d4-a443-4582-affd-a19c0617592f': [
    `I need help cooking ${item}. Number of people: ${size}.`,
    `I need a cook for ${item}. ${noticed}.`,
  ],
  // Painting
  '5a73f57b-f2d7-46c4-b774-7f8323d3c516': [
    `I need ${where} painted. Area: ${size}.`,
    `The paint on ${item} needs touch-up. ${noticed}.`,
  ],
  // Welding
  '9179ad4e-dc07-410a-aacf-6a2438dbc467': [
    `The metal ${item} at ${where} needs welding. ${noticed}.`,
    `I need a metal ${item} made or repaired. Size: ${size}.`,
  ],
  // Tile Setting
  '57e6a000-a5ac-4cd9-b5de-1440ea03558e': [
    `Tiles at ${where} need to be set or replaced. Area: ${size}.`,
    `Some tiles at ${where} are loose or cracked. ${noticed}.`,
  ],
  // House Cleaning
  '63b4db38-c7d4-415f-8e87-6e4e98506af8': [
    `I need ${where} cleaned. Size: ${size}.`,
    `I need help cleaning ${item}. ${noticed}.`,
  ],
  // Laundry
  'f73ea827-3e32-44a9-98a2-4cb59978c83a': [
    `I need laundry washed and folded. Amount: ${size}.`,
    `I need ${item} washed. ${noticed}.`,
  ],
  // Motorcycle Repair
  '45a65bb3-c7dc-4a7c-ae47-5db1ced919f4': [
    `My motorcycle needs repair. ${noticed}.`,
    `The ${item} on my motorcycle needs checking. ${noticed}.`,
  ],
  // Appliance Repair
  '02be35a0-4c39-4f91-a684-93a3d5b54248': [
    `My ${item} needs repair. ${noticed}.`,
    `The ${item} at ${where} is not working properly. ${noticed}.`,
  ],
  // Aircon Repair
  'f2f28666-6ada-42a8-adf4-caf6e5c553c9': [
    `The aircon at ${where} needs checking. ${noticed}.`,
    `The aircon at ${where} needs cleaning or repair. ${noticed}.`,
  ],
  // Sewing
  'aab5b18c-de07-4de0-b888-464b3bd83913': [
    `I need ${item} sewn or repaired. ${noticed}.`,
    `I need ${item} altered. Amount: ${size}.`,
  ],
  // Gardening
  '17e02f3a-1b75-428f-98a2-75bb9cfd13ae': [
    `I need help with the garden at ${where}. ${noticed}.`,
    `I need plants trimmed or cleared at ${where}. Area: ${size}.`,
  ],
};

export function descriptionPresetsForSkill(skillId: string | null): readonly string[] {
  if (skillId === null) return [];
  return PRESETS_BY_SKILL_ID[skillId] ?? GENERIC_PRESETS;
}

export function hasUnfilledPresetBlank(description: string): boolean {
  return PRESET_BLANK_TOKENS.some((token) => description.includes(token));
}
