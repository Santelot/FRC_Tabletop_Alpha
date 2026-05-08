// ============================================================
//  CONFIG — single source of truth for tweakable values
// ============================================================
//
//  This file holds:
//   1. Game constants ported from v0.2 (drivetrain stats, scoring, etc.)
//   2. Model paths
//   3. PER-MODEL TRANSFORM OFFSETS — the most-edited part of this file.
//      If a model loads at the wrong position, rotation, or scale, fix it
//      here instead of going back into Blender/TinkerCad.
//
//  COORDINATE SYSTEM (Three.js convention):
//    +X = field length (red side at -X, blue side at +X)
//    +Y = up (vertical, away from ground)
//    +Z = field depth (away from camera in default broadcast view)
//
//  Hex world units: 1 hex flat-to-flat = HEX_SIZE world units (default 2).
//  So if your bot model is 2 units wide, it fits exactly inside one hex.
// ============================================================

// ---- World scale ----
export const HEX_SIZE = 2.0;                    // flat-to-flat, world units
export const HUB_HEIGHT = 2.5;                  // visual, only used as a hint for camera framing

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
export const TICK_DURATION = 380;  // ms per movement tick
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
//  MODEL PATHS
// ============================================================
//  Vite serves /public/* at the site root, so '/models/foo.glb'
//  resolves to /public/models/foo.glb at dev time AND at build time.

// In production on GitHub Pages, BASE_URL is the repo subpath ('/frc-auton-3d/').
// In dev, it's '/'.
const B = import.meta.env.BASE_URL;

export const MODEL_PATHS = {
  field:        `${B}models/field.glb`,
  hub:          `${B}models/hub.glb`,
  cargo:        `${B}models/cargo.glb`,
  bot_tank:     `${B}models/bot-tank.glb`,
  bot_westcoast:`${B}models/bot-westcoast.glb`,
  bot_mecanum:  `${B}models/bot-mecanum.glb`,
  bot_swerve:   `${B}models/bot-swerve.glb`,
};

// ============================================================
//  MODEL TRANSFORMS — fix origin / rotation / scale per model
// ============================================================
//  Use these when your model's pivot point isn't at the contact point,
//  or it doesn't face +X, or it's the wrong size.
//
//  All values are applied AT LOAD TIME — the model's mesh is wrapped in
//  a Three.js Group, and the offsets are applied to the inner mesh, so
//  the OUTER group still has its origin at (0,0,0) for placement code.
//
//  - position: [x, y, z]  shifts the model relative to its loaded origin.
//      Common case: model's pivot is at its center, you want it on the ground.
//      Fix: position: [0, +HEIGHT/2, 0]  to shift it up by half its height.
//  - rotation: [x, y, z]  Euler angles in DEGREES (we convert to radians).
//      Common case: model faces +Z but we need +X.
//      Fix: rotation: [0, -90, 0]  rotates 90° around Y axis (clockwise from above).
//  - scale: number or [x, y, z]   uniform or per-axis scaling.
//      Common case: model is huge or tiny.
//      Fix: scale: 0.05  (or whatever ratio gets it to ~2 units wide).
//
//  TIP: Run with placeholders first (just don't put .glb files in
//  public/models/ yet) to see the field layout, then drop your models in
//  one at a time and tune their transforms here.

export const MODEL_TRANSFORMS = {
  field: {
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale:    1.0,
  },
  hub: {
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale:    1.0,
  },
  cargo: {
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale:    1.0,
  },
  bot_tank: {
    position: [0, 0, 0],
    rotation: [0, 0, 0],   // model should face +X. If it doesn't, set [0, -90, 0] or similar.
    scale:    1.0,
  },
  bot_westcoast: {
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale:    1.0,
  },
  bot_mecanum: {
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale:    1.0,
  },
  bot_swerve: {
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale:    1.0,
  },
};

// ============================================================
//  CAMERA PRESETS
// ============================================================
//  Each preset defines where the camera sits and where it looks at.
//  All positions in world units, relative to field center (0, 0, 0).

export const CAMERA_PRESETS = {
  broadcast: {
    position: [0, 18, 22],    // angled overhead, looking down at center
    lookAt:   [0, 0, 0],
    fov:      45,
  },
  topdown: {
    position: [0, 32, 0.01],  // straight down (0.01 z avoids gimbal singularity)
    lookAt:   [0, 0, 0],
    fov:      45,
  },
  orbit: {
    position: [22, 14, 22],   // perspective angle, user can drag
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
    position:  [0, 4, 0],   // sits at the center, just above hub
    distance:  10,
  },
};
