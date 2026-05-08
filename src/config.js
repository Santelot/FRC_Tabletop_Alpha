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
  mecanum:    { label: 'Mecanum',  initiative: 3, blocks: 1, reach: 3 },
  tank:       { label: 'Tank',     initiative: 4, blocks: 3, reach: 3 },
  west_coast: { label: 'WC',       initiative: 2, blocks: 2, reach: 4 },
  swerve:     { label: 'Swerve',   initiative: 1, blocks: 2, reach: 5 },
};

export const SCORING_ACCURACY = { 1: 50, 2: 75, 3: 90 };

export const SCRIPTS = {
  cross_park:    { label: 'Cross & Park',  desc: 'Drive forward and park. +2 TAXI.' },
  quick_score:   { label: 'Quick Score',   desc: 'Move to firing line. Take 1 shot.' },
  triple_threat: { label: 'Triple Threat', desc: 'Pickup cargo en route. Shoot up to 2 (cap).' },
  defensive_set: { label: 'Defensive Set', desc: 'Cross sides. Establish a blocking aura.' },
  disruptor:     { label: 'Disruptor',     desc: 'Cross field. Force closest opposing shooter to roll twice — worse taken.' },
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
export const ACTIVE_CHALLENGE = 'rapid_react';

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

  // Charged Up assets (stubs for later)
  field_chargedup:   `${B}models/field-chargedup.glb`,
  hub_chargedup:     `${B}models/hub-chargedup.glb`,
  cargo_chargedup:   `${B}models/cargo-chargedup.glb`,

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
  field_chargedup:   { ...IDENTITY },
  hub_chargedup:     { ...IDENTITY },
  cargo_chargedup:   { ...IDENTITY },

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
    position: [0, 18, 22],
    lookAt:   [0, 0, 0],
    fov:      45,
  },
  topdown: {
    position: [0, 32, 0.01],
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
    intensity: 0.45,
  },
  hemisphere: {
    skyColor:    0xddeeff,
    groundColor: 0x445566,
    intensity:   0.4,
  },
  keyLight: {
    color:     0xffffff,
    intensity: 1.5,
    position:  [10, 18, 8],
    castShadow: true,
  },
  fillLight: {
    color:     0xffe9cc,
    intensity: 0.45,
    position:  [-12, 8, -6],
  },
  hubGlow: {
    color:     0xffb627,
    intensity: 1.2,
    position:  [0, 4, 0],
    distance:  10,
  },
};
