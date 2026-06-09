// ============================================================
//  CONFIG — single source of truth for tweakable values
// ============================================================
//
//  This file holds:
//   1. Game constants ported from v0.2 (drivetrain stats, scoring, etc.)
//   2. The ACTIVE_CHALLENGE selector — switches between Rapid React,
//      Charged Up, etc.
//   3. Model paths (per-challenge field/hub/cargo,
//      per-drivetrain/alliance/scoring bots)
//   4. PER-MODEL TRANSFORM OFFSETS — the most-edited part of this file.
//      If a model loads at the wrong position, rotation, or scale, fix it
//      here instead of going back into Blender/TinkerCad.
//
//  COORDINATE SYSTEM (Three.js convention):
//    +X = field length (red side at -X, blue side at +X)
//    +Y = up (vertical, away from ground)
//    +Z = field depth (away from camera in default broadcast view)
//
//  Hex world units: 1 hex flat-to-flat = HEX_SIZE world units (default 2).
// ============================================================

// ---- World scale ----
export const HEX_SIZE = 2.0;                    // flat-to-flat, world units
export const HUB_HEIGHT = 2.5;                  // visual hint for camera framing

// ---- Game constants (ported from v0.2) ----
export const DRIVETRAINS = {
  mecanum:    { label: 'Mecanum',  initiative: 4, blocks: 1, reach: 3 },
  tank:       { label: 'Tank',     initiative: 3, blocks: 3, reach: 3 },
  west_coast: { label: 'WC',       initiative: 2, blocks: 2, reach: 4 },
  swerve:     { label: 'Swerve',   initiative: 1, blocks: 2, reach: 5 },
};

export const SCORING_ACCURACY = { 1: 50, 2: 75, 3: 90 };
export const STEADIED_ACCURACY = { 1: 75, 2: 90, 3: 95 }; // Quick Score: one scoring band sharper
export const DISRUPT_TIER_DROP = 2;                        // Disruptor knocks target down N tiers (below L1 = jammed)

export const SCRIPTS = {
  cross_park: {
    label:  'Cross & Park',
    desc:   'Drive forward and park. +2 TAXI.',
    detail: 'Roll across the line and stop. No cargo, no risk — just the taxi bonus.',
    scores: '+2 guaranteed',
    tip:    'The safe floor. Great on a low scorer (L1) or when you just need points in the bank.',
  },
  quick_score: {
    label:  'Quick Score',
    desc:   'Set up and fire the preload — steadied aim.',
    detail: 'Skip the pickup detour and take one clean, set shot at your preload. Steadied aim fires as if one scoring tier sharper (L1\u219275%, L2\u219290%, L3\u219295%).',
    scores: '+4 on a hit  ·  steadied: L1 75% / L2 90% / L3 95%',
    tip:    'The reliable single. Best on LOW-intake bots that can only carry one cargo — it out-scores a one-shot Triple Threat.',
  },
  triple_threat: {
    label:  'Triple Threat',
    desc:   'Grab a cargo, then fire up to 2 at base accuracy.',
    detail: 'Pick up a field cargo on the way in and fire up to two shots at base accuracy. The second shot needs L2+ intake to carry it — at L1 intake this is just one base shot.',
    scores: 'up to +8  ·  two hits at base 50 / 75 / 90%',
    tip:    'The ceiling play, and only worth it at L2+ intake. At L1 intake, take Quick Score instead.',
  },
  defensive_set: {
    label:  'Defensive Set',
    desc:   'Cross over and pin adjacent hexes (+1 in auto).',
    detail: 'Cross to the enemy side and drop blocking pins on adjacent hexes — opposing robots can\u2019t pass through them for the rounds that follow. Auto grants one extra pin.',
    scores: '0 direct  ·  walls off Tank 4 / Swerve\u00b7WC 3 / Mecanum 2 hexes',
    tip:    'Now genuinely worth a slot. Put a Tank here to wall off four lanes and choke their whole offense.',
  },
  disruptor: {
    label:  'Disruptor',
    desc:   'Cross and jam the enemy\u2019s best shooter.',
    detail: 'Race across and jam the opposing alliance\u2019s best shooter: its auto shot is knocked down two scoring tiers. An L3 ace drops to a coin-flip; L1\u2013L2 shooters are jammed cold (no shot).',
    scores: '0 direct  ·  guts their ace (L3 90%\u219250%) or jams it outright',
    tip:    'Sacrifice your scoring to neutralize their biggest threat. Swings the margin as hard as scoring yourself.',
  },
};

export const SHOT_POINTS = 4;
export const PARK_POINTS = 2;
export const TICK_DURATION = 380;
export const MAX_TICKS = 10;

export const BOT_IDS = ['R1', 'R2', 'R3', 'B1', 'B2', 'B3'];

export const DEFAULTS = {
  R1: { drivetrain: 'swerve',     scoring: 3, intake: 2, climber: 1, script: 'quick_score'   },
  R2: { drivetrain: 'tank',       scoring: 1, intake: 3, climber: 2, script: 'triple_threat' },
  R3: { drivetrain: 'mecanum',    scoring: 2, intake: 1, climber: 0, script: 'cross_park'    },
  B1: { drivetrain: 'west_coast', scoring: 2, intake: 2, climber: 2, script: 'defensive_set' },
  B2: { drivetrain: 'swerve',     scoring: 3, intake: 1, climber: 1, script: 'quick_score'   },
  B3: { drivetrain: 'tank',       scoring: 2, intake: 3, climber: 3, script: 'disruptor'     },
};

// ============================================================
//  CHALLENGES — which one is active determines field, hub, cargo,
//  and which bot scoring variant (shooter vs manipulator) is loaded.
// ============================================================

/**
 * Each challenge entry:
 *   - label:     display name
 *   - scoring:   'shooter' | 'manipulator' — determines which bot model
 *                variant is loaded for that challenge.
 *   - field:     model key for the field
 *   - hub:       model key for the central scoring structure
 *   - cargo:     model key for the cargo / piece model
 */
export const CHALLENGES = {
  rapid_react: {
    label:   'Rapid React',
    scoring: 'shooter',
    field:   'field_rapidreact',
    hub:     'hub_rapidreact',
    cargo:   'cargo_rapidreact',
  },
  charged_up: {
    label:   'Charged Up',
    scoring: 'manipulator',
    field:   'field_chargedup',
    hub:     'hub_chargedup',
    cargo:   'cargo_chargedup',
  },
};

/**
 * Switch this to test a different challenge once its models are in place.
 * Phase 1+2 only need rapid_react; charged_up keys are stubbed for later.
 */
export let ACTIVE_CHALLENGE = 'rapid_react';

/** Switch the active challenge at runtime (the setup menu calls this). */
export function setActiveChallenge(id) {
  if (CHALLENGES[id]) ACTIVE_CHALLENGE = id;
  return ACTIVE_CHALLENGE;
}

// ============================================================
//  MODEL PATHS
// ============================================================
//  Vite serves /public/* at the site root.
//  In production on GitHub Pages, BASE_URL is the repo subpath.

const B = import.meta.env.BASE_URL;

/**
 * Helper: bot model key for a given drivetrain / alliance / scoring type.
 * Returns e.g. 'bot_tank_red_shooter'.
 */
export function botModelKey(drivetrain, alliance, scoringType) {
  return `bot_${drivetrain}_${alliance}_${scoringType}`;
}

/**
 * All model paths.
 *   - Per-challenge: field, hub, cargo (3 keys × 2 challenges = 6)
 *   - Per-bot variant: drivetrain × alliance × scoring (4 × 2 × 2 = 16)
 *
 * Files live in /public/models/. If a file is missing, the loader falls
 * back to a placeholder so the rest of the app keeps working.
 */
export const MODEL_PATHS = {
  // Rapid React assets
  field_rapidreact:  `${B}models/field-rapidreact.glb`,
  hub_rapidreact:    `${B}models/hub-rapidreact.glb`,
  cargo_rapidreact:  `${B}models/cargo-rapidreact.glb`,

  // Charged Up assets
  field_chargedup:              `${B}models/field-chargedup.glb`,
  chargestation_red_chargedup:  `${B}models/chargestation-chargedup.glb`,
  chargestation_blue_chargedup: `${B}models/chargestation-chargedup.glb`,
  grid_red_chargedup:           `${B}models/grid_red_chargedup.glb`,
  grid_blue_chargedup:          `${B}models/grid_blue_chargedup.glb`,
  cone_chargedup:               `${B}models/cone-chargedup.glb`,
  cube_chargedup:               `${B}models/cube-chargedup.glb`,

  // Bots — RED · SHOOTER (Rapid React)
  bot_tank_red_shooter:        `${B}models/bot-tank-red-shooter.glb`,
  bot_west_coast_red_shooter:  `${B}models/bot-westcoast-red-shooter.glb`,
  bot_mecanum_red_shooter:     `${B}models/bot-mecanum-red-shooter.glb`,
  bot_swerve_red_shooter:      `${B}models/bot-swerve-red-shooter.glb`,

  // Bots — BLUE · SHOOTER (Rapid React)
  bot_tank_blue_shooter:       `${B}models/bot-tank-blue-shooter.glb`,
  bot_west_coast_blue_shooter: `${B}models/bot-westcoast-blue-shooter.glb`,
  bot_mecanum_blue_shooter:    `${B}models/bot-mecanum-blue-shooter.glb`,
  bot_swerve_blue_shooter:     `${B}models/bot-swerve-blue-shooter.glb`,

  // Bots — RED · MANIPULATOR (Charged Up etc.)
  bot_tank_red_manipulator:        `${B}models/bot-tank-red-manipulator.glb`,
  bot_west_coast_red_manipulator:  `${B}models/bot-westcoast-red-manipulator.glb`,
  bot_mecanum_red_manipulator:     `${B}models/bot-mecanum-red-manipulator.glb`,
  bot_swerve_red_manipulator:      `${B}models/bot-swerve-red-manipulator.glb`,

  // Bots — BLUE · MANIPULATOR (Charged Up etc.)
  bot_tank_blue_manipulator:       `${B}models/bot-tank-blue-manipulator.glb`,
  bot_west_coast_blue_manipulator: `${B}models/bot-westcoast-blue-manipulator.glb`,
  bot_mecanum_blue_manipulator:    `${B}models/bot-mecanum-blue-manipulator.glb`,
  bot_swerve_blue_manipulator:     `${B}models/bot-swerve-blue-manipulator.glb`,
};

// ============================================================
//  MODEL TRANSFORMS — fix origin / rotation / scale per model
// ============================================================
//  See MODELS.md for the full guide on how to use these.
//  Quick reference:
//    position: [x, y, z]   shift in world units
//    rotation: [x, y, z]   Euler angles in DEGREES
//    scale:    number      uniform; or [sx, sy, sz] for per-axis
//
//  Each variant has its own entry so you can tune each independently
//  if they were modeled with different pivot points.

const IDENTITY = { position: [.3, 0, 0], rotation: [0, 0, 0], scale: 102.0 };

export const MODEL_TRANSFORMS = {
  // ---- Field / hub / cargo ----
  field_rapidreact:  { ...IDENTITY },
  hub_rapidreact:    { position: [1.8, 0, 1.5], rotation: [0, 0, 0], scale: 102.0 },
  cargo_rapidreact:  { ...IDENTITY },
  // ---- Charged Up structures & pieces — TUNE position / rotation / scale here ----
  //   position: [x, y, z] world-unit offset   rotation: [x, y, z] degrees   scale: number
  //   Grids and charge stations are dropped at an anchor hex, then nudged by these
  //   offsets (same idea as the bots' [.3,0,0]). Cones/cubes sit at their hexes;
  //   their transform applies to every copy (use it mainly to set piece scale).
  field_chargedup:              { ...IDENTITY },
  chargestation_red_chargedup:  { position: [-4.5, 0, 13.4], rotation: [0, 90, 0], scale: 102.0 },
  chargestation_blue_chargedup: { position: [-4.5, 0, 13.4], rotation: [0, 90, 0], scale: 102.0 },
  grid_red_chargedup:           { position: [-25.8, 0, -2.6], rotation: [0, 90, 0], scale: 102.0 },
  grid_blue_chargedup:          { position: [-21.4, 0, -8], rotation: [0, 90, 0], scale: 102.0 },
  cone_chargedup:               { position: [5, 0, 8.7], rotation: [0, 90, 0], scale: 102.0 },
  cube_chargedup:               { position: [3, 0, 8.7], rotation: [0, 90, 0], scale: 102.0 },

  // ---- Bots: RED · SHOOTER ----
  bot_tank_red_shooter:        { ...IDENTITY },
  bot_west_coast_red_shooter:  { ...IDENTITY },
  bot_mecanum_red_shooter:     { ...IDENTITY },
  bot_swerve_red_shooter:      { ...IDENTITY },

  // ---- Bots: BLUE · SHOOTER ----
  bot_tank_blue_shooter:       { ...IDENTITY },
  bot_west_coast_blue_shooter: { ...IDENTITY },
  bot_mecanum_blue_shooter:    { ...IDENTITY },
  bot_swerve_blue_shooter:     { ...IDENTITY },

  // ---- Bots: RED · MANIPULATOR ----
  bot_tank_red_manipulator:        { ...IDENTITY },
  bot_west_coast_red_manipulator:  { ...IDENTITY },
  bot_mecanum_red_manipulator:     { ...IDENTITY },
  bot_swerve_red_manipulator:      { ...IDENTITY },

  // ---- Bots: BLUE · MANIPULATOR ----
  bot_tank_blue_manipulator:       { ...IDENTITY },
  bot_west_coast_blue_manipulator: { ...IDENTITY },
  bot_mecanum_blue_manipulator:    { ...IDENTITY },
  bot_swerve_blue_manipulator:     { ...IDENTITY },
};

// ============================================================
//  CAMERA PRESETS
// ============================================================

export const CAMERA_PRESETS = {
  broadcast: {
    position: [0, 24, 40], //[0, 18, 22]
    lookAt:   [0, 0, 0],
    fov:      45,
  },
  topdown: {
    position: [0, 45, 0.01],
    lookAt:   [0, 0, 0],
    fov:      45,
  },
  orbit: {
    position: [22, 14, 22],
    lookAt:   [0, 0, 0],
    fov:      50,
  },
};

// ============================================================
//  LIGHTING
// ============================================================

export const LIGHTING = {
  ambient: {
    color:     0xffffff,
    intensity: 0.8, // 0.45
  },
  hemisphere: {
    skyColor:    0xddeeff,
    groundColor: 0x445566,
    intensity:   0.6, // 0.4
  },
  keyLight: {
    color:     0xffffff,
    intensity: 2, // 1.5
    position:  [10, 18, 8],
    castShadow: true,
  },
  fillLight: {
    color:     0xffe9cc,
    intensity: 0.8, // 0.45
    position:  [-12, 8, -6],
  },
  hubGlow: {
    color:     0xffb627,
    intensity: 2, // 1.2
    position:  [0, 4, 0],
    distance:  10,
  },
};
