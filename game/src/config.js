// VICE HARBOR — tuning constants, palette and the five story missions.
// Every name, character and place here is original fiction.
export const CITY = {
  blocks: 9, // blocks per side
  blockSize: 46,
  roadWidth: 14,
  get half() {
    return (this.blocks * (this.blockSize + this.roadWidth)) / 2;
  },
};

export const PALETTE = {
  sky: 0x9ec8e8,
  sunset: 0xff9a5c,
  ground: 0x4a4f55,
  sidewalk: 0x9aa0a8,
  road: 0x3a3e45,
  roadLine: 0xd8c95a,
  building: [0x7d94a8, 0xa89478, 0x9484a8, 0x74a88a, 0xb89c74, 0x7490a8, 0xc08a64, 0x5f8296],
  neon: [0xff2e88, 0x22e6ff, 0xffe14d, 0x7cff4d, 0xff7a2e, 0xc04dff],
  car: [0xc22e2e, 0x2e6fc2, 0xe8c832, 0x2ec27a, 0xe8e8e8, 0x222222, 0x7a4dc2, 0xe87a2e],
  police: 0x1c2f4d,
  taxi: 0xf2c200,
};

export const PLAYER = {
  walkSpeed: 6.4, // round-3 polish: slightly brisker walk so on-foot travel feels less slow
  runSpeed: 11.5, // round-2 polish: slightly quicker sprint so on-foot escapes feel fair
  radius: 0.6,
  maxHealth: 100,
  punchDamage: 25,
  pistolDamage: 34,
  pistolRange: 55,
  pistolCooldown: 0.28,
};

export const CAR_PHYSICS = {
  accel: 22,
  brake: 34,
  maxSpeed: 38,
  reverseMax: 12,
  turnRate: 1.9,
  drag: 0.6,
};

export const WANTED = {
  decayDelay: 18, // seconds of no crime before stars start dropping
  decayStep: 9, // seconds per star lost while hidden
  maxStars: 5,
  copsPerStar: [0, 2, 3, 4, 6, 8],
};

// Story missions. Each mission is a chain of objectives; finishing the chain
// pays cash and unlocks the next one. Positions are city coordinates.
export const MISSIONS = [
  {
    id: 1,
    name: 'Harbor Pickup',
    giver: 'Mara Voss',
    say: 'Grab the package, Rex. No cops, no noise — the club pays clean.',
    intro: 'Mara needs a package lifted from the docks. Get to the pier, grab it, bring it back to her club.',
    reward: 500,
    steps: [
      { type: 'goto', label: 'Reach the pier pickup', x: -150, z: -150, radius: 6 },
      { type: 'goto', label: 'Deliver the package to Club Neon', x: 92, z: -92, radius: 6 },
    ],
  },
  {
    id: 2,
    name: 'Neon Courier',
    giver: 'Mara Voss',
    say: 'Three drops, one night. Drive like the tide is behind you.',
    intro: 'Three drops across the strip before the rival crew wakes up. Drive fast, stay clean.',
    reward: 800,
    steps: [
      { type: 'goto', label: 'Drop 1: the arcade on Coral Row', x: -92, z: 92, radius: 6 },
      { type: 'goto', label: 'Drop 2: the motel on Sunset Strip', x: 150, z: 30, radius: 6 },
      { type: 'goto', label: 'Drop 3: the rooftop bar downtown', x: 30, z: 150, radius: 6 },
    ],
  },
  {
    id: 3,
    name: 'Warehouse Heat',
    giver: 'Detective Rook',
    say: 'Blackfin is running product through that warehouse. Shut it down — quietly.',
    intro: 'The Blackfin gang is moving product through the east warehouse. Clear them out, then torch their stash.',
    reward: 1200,
    steps: [
      { type: 'defeat', label: 'Clear the Blackfin gang (0/4)', x: 150, z: -150, radius: 18, count: 4 },
      { type: 'goto', label: 'Torch the stash in the warehouse', x: 150, z: -150, radius: 6 },
    ],
  },
  {
    id: 4,
    name: 'Bridge Getaway',
    giver: 'Mara Voss',
    say: 'Rook sold us out. Get that ledger back before the harbor police do.',
    intro: 'Rook sold us out. Grab the ledger from the bridge toll office and lose the harbor police.',
    reward: 1600,
    steps: [
      { type: 'goto', label: 'Grab the ledger at the toll office', x: -30, z: 180, radius: 6 },
      { type: 'escape', label: 'Lose the police (drop to 0 stars)', x: 0, z: 0, radius: 0, count: 0 },
    ],
  },
  {
    id: 5,
    name: "Kingpin's Fall",
    giver: 'Detective Rook',
    say: 'Crane is at the marina tower. End this, and the city is yours.',
    intro: 'Blackfin boss Silas Crane is holding court at the marina tower. End it. The city is yours after this.',
    reward: 3000,
    steps: [
      { type: 'defeat', label: 'Fight through Crane’s guards (0/5)', x: -180, z: 180, radius: 20, count: 5 },
      { type: 'defeat', label: 'Take down Silas Crane', x: -180, z: 180, radius: 20, count: 1, boss: true },
    ],
  },
];

export const SAVE_KEY = 'viceharbor-save-v1';
