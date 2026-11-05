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
  // Moving & Hauling (was General Labor)
  '90be7a80-35e1-49ba-a2c8-c4689212603f': [
    `I need help moving or carrying ${item} at ${where}. Amount: ${size}.`,
    `I need general help at ${where}: ${noticed}.`,
  ],
  // Masonry
  '58050052-cfa7-4e2b-8cd1-6e74f20d468f': [
    `The wall or concrete at ${where} needs masonry work. ${noticed}.`,
    `I need ${item} built or patched at ${where}. Size: ${size}.`,
  ],
  // Cooking & Food Prep (was Cooking)
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
  // Laundry & Ironing (was Laundry)
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
  // Aircon Cleaning & Repair (was Aircon Repair)
  'f2f28666-6ada-42a8-adf4-caf6e5c553c9': [
    `The aircon at ${where} needs checking. ${noticed}.`,
    `The aircon at ${where} needs cleaning or repair. ${noticed}.`,
  ],
  // Sewing & Dressmaking (was Sewing)
  'aab5b18c-de07-4de0-b888-464b3bd83913': [
    `I need ${item} sewn or repaired. ${noticed}.`,
    `I need ${item} altered. Amount: ${size}.`,
  ],
  // Gardening & Landscaping (was Gardening)
  '17e02f3a-1b75-428f-98a2-75bb9cfd13ae': [
    `I need help with the garden at ${where}. ${noticed}.`,
    `I need plants trimmed or cleared at ${where}. Area: ${size}.`,
  ],
  // ---- 4Ps catalog additions (20261105140000_skills_4ps_catalog.sql) ----
  // Roofing & Gutter Repair
  '186526be-1633-4470-9d50-356dbe65cc31': [
    `The roof at ${where} is leaking. ${noticed}.`,
    `The gutter or roof sheet at ${where} needs repair. Size: ${size}.`,
  ],
  // Glass & Aluminum Works
  'c619288a-aa55-49c3-a65a-f92d20e847e9': [
    `The window or glass at ${where} needs repair or replacement. ${noticed}.`,
    `I need ${item} made of glass or aluminum installed at ${where}. Size: ${size}.`,
  ],
  // Electronics & Cellphone Repair
  'd724bcf8-4dc1-43d7-b972-c09302326990': [
    `My ${item} is not working properly. ${noticed}.`,
    `I need my cellphone or ${item} checked. ${noticed}.`,
  ],
  // Driving
  '45d9636f-e396-4ef9-8295-1f92e79c8800': [
    `I need a driver for ${item}. ${noticed}.`,
    `I need someone to drive us to ${where}. Passengers: ${size}.`,
  ],
  // Catering & Event Help
  '591426b4-3e3c-42c1-9afd-cdf46d7dac07': [
    `I need help serving food at ${where}. Guests: ${size}.`,
    `I need helpers to set up and clean up ${item}. ${noticed}.`,
  ],
  // Baking
  'eeed1bad-d9e5-4879-bffc-c548f3baed68': [
    `I need ${item} baked. Amount: ${size}.`,
    `I need a baker for ${item}. ${noticed}.`,
  ],
  // Pest Control
  'b1ca2177-a90e-473f-a3be-4bd5253072ea': [
    `There are pests at ${where}. ${noticed}.`,
    `I need ${where} treated for termites, ants or cockroaches. Area: ${size}.`,
  ],
  // Caregiving
  'd7e7d525-9d07-448a-8b79-b1f1565f39b3': [
    `I need a caregiver for an elderly or sick family member. ${noticed}.`,
    `I need help with daily care at ${where}. ${noticed}.`,
  ],
  // Child Care (Yaya)
  '05c8676d-0836-46ae-9994-d4b7b80f9a12': [
    `I need someone to watch my children at ${where}. Children: ${size}.`,
    `I need a yaya to help with ${item}. ${noticed}.`,
  ],
  // Massage Therapy
  'e97fc357-8f6c-4c46-90d8-e1f4f24f999e': [
    `I need a home massage at ${where}. ${noticed}.`,
    `I need a massage for ${item}. Persons: ${size}.`,
  ],
  // Haircut & Barbering
  '86953d01-06b1-406e-ab42-94549204b054': [
    `I need a home haircut at ${where}. Persons: ${size}.`,
    `I need ${item} done for my hair. ${noticed}.`,
  ],
  // Manicure & Pedicure
  'f9abc619-dacf-4897-99e7-46ac47abf8c1': [
    `I need a home manicure or pedicure at ${where}. Persons: ${size}.`,
    `I need ${item} done for my nails. ${noticed}.`,
  ],
  // Pet Care
  '2276d8c6-1e54-4f0e-b7b2-406bd85ffd64': [
    `I need someone to feed and watch my pet at ${where}. ${noticed}.`,
    `I need my pet bathed or groomed. ${noticed}.`,
  ],
  // Tutoring
  '9858d5fb-8e86-461a-9e29-06e4f2638716': [
    `I need a tutor for my child in ${item}. ${noticed}.`,
    `I need help with homework in ${item}. Children: ${size}.`,
  ],
};

export function descriptionPresetsForSkill(skillId: string | null): readonly string[] {
  if (skillId === null) return [];
  return PRESETS_BY_SKILL_ID[skillId] ?? GENERIC_PRESETS;
}

export function hasUnfilledPresetBlank(description: string): boolean {
  return PRESET_BLANK_TOKENS.some((token) => description.includes(token));
}
