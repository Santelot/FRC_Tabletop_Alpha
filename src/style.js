// ============================================================
//  STYLE & TIMING — all the new tunable visual + pacing knobs
// ============================================================
//  This file is separate from config.js so it can be updated freely
//  without touching your MODEL_TRANSFORMS or CAMERA_PRESETS.
//
//  Tweak any value here, save, the dev server hot-reloads.
// ============================================================

// ============================================================
//  HEX FIELD STYLING
// ============================================================
//  Controls the look of the procedurally-drawn hex grid.

export const HEX_FIELD_STYLE = {
  // Stroke thickness in CSS pixels (Line2 uses screen-space lines).
  // Try 1.5 (subtle) → 4 (bold) → 8 (chunky).
  strokeWidth: 2,

  // Visual radius of each hex outline as a fraction of HEX_SIZE.
  // This is INDEPENDENT of grid spacing — change it to make individual
  // hexes bigger or smaller without affecting how far apart they sit.
  //   0.30 → tiny dots, lots of empty floor between cells
  //   0.50 → small hexes with a visible gap (Phase 3 default)
  //   0.55 → hexes nearly touch (recommended for a "solid grid" look)
  //   0.577 → flat sides perfectly touch (1/sqrt(3))
  //   0.60+ → hexes overlap slightly at the corners
  hexRadiusMul: 0.9,

  // Per-zone stroke colors and opacities.
  // Each zone: { color: 0xRRGGBB, opacity: 0..1 }
  zones: {
    neutral:  { color: 0x9ea4b0, opacity: 0.30 },
    redZone:  { color: 0xe63946, opacity: 0.55 },
    blueZone: { color: 0x1e88e5, opacity: 0.55 },
    hub:      { color: 0xffb627, opacity: 0.95 },
  },

  // Underglow: a second, thicker, softer line below each hex (gives a halo).
  // Set enabled:false to disable.
  glow: {
    enabled:   true,
    width:     6,        // wider than strokeWidth
    opacity:   0.18,     // softer
    yOffset:   0.002,    // sits just below the main stroke
  },

  // Translucent fill discs (only on hub hexes by default).
  // Note: radiusMul here scales the fill independently; usually you want
  // it a bit smaller than hexRadiusMul above so the fill sits inside the
  // outline rather than sticking out past it.
  hubHexFill: {
    enabled:    true,
    color:      0xffb627,
    opacity:    0.22,
    radiusMul:  0.8,    // fraction of HEX_SIZE
  },

  // Lift the whole grid this far above ground (avoids z-fighting).
  yLift: 0.01,
};

// ============================================================
//  HUB GLOW HALO
// ============================================================
//  An extra "self-lit" halo around the hub model so the hub itself
//  visibly glows (separate from the lighting that affects other objects).

export const HUB_GLOW_HALO = {
  enabled:    true,
  // Inner sprite (close to the hub)
  innerColor:    0xffb627,
  innerOpacity:  0.55,
  innerRadius:   1.0,        // world units
  // Outer sprite (wider, softer)
  outerColor:    0xffd15c,
  outerOpacity:  0.22,
  outerRadius:   6,
  // Vertical position of the halo center
  yPosition:     7.5,
  // Pulse speed (cycles per second). 0 = static.
  pulseRate:     0.5,
  // Pulse depth (0 = no pulse, 1 = halo opacity goes 0→max→0)
  pulseDepth:    0.25,
};

// ============================================================
//  ATMOSPHERE — fog + scene background
// ============================================================
//  The "vignette feel at distance" comes from THREE.Fog. Push `near`
//  much further out to keep models crisp even when the camera pulls back.

export const ATMOSPHERE = {
  // Background color of the canvas
  backgroundColor: 0x1f2025,

  fog: {
    enabled: true,
    color:   0x1f2025,
    near:    60,    // distance at which fog starts (was 35 — too aggressive)
    far:     140,   // distance at which everything is fully fogged
  },

  // Ground plane (the dark surface beneath the hex grid)
  ground: {
    enabled:   true,
    color:     0x17181c,//0x2c2d34,
    roughness: 0.95,
    y:         -0.08,   // ← TUNE: lower (more negative) if you ever see floor flicker again
  },
};

// ============================================================
//  BOT LABELS — floating ID labels above each bot
// ============================================================

export const BOT_LABELS = {
  enabled:        true,
  // Vertical offset above the bot (world units)
  yOffset:        2.2,
  // CSS font-size, opacity, etc. are in styles.css under .bot-label
  // Hide labels in cinematic broadcast view? (set true if labels feel cluttered)
  hideInBroadcast: false,
};

// ============================================================
//  CARGO INDICATORS — small dots above each bot showing held cargo
// ============================================================

export const CARGO_INDICATORS = {
  enabled:        true,
  yOffset:        1.6,     // height above bot center
  spacing:        0.45,    // horizontal spacing between two dots
  // Visual style of the dots
  filledColor:    0xd1ff1a,
  filledEmissive: 0.4,
  emptyColor:     0x44444a,
  emptyOpacity:   0.35,
  dotRadius:      0.3,
  // Show a thin outline ring when the slot is "available but unused"
  emptyOutline:   true,
};

// ============================================================
//  CHARGE DOCK — Charged Up endgame (tune raiseY to your model)
// ============================================================
export const CHARGE_DOCK = {
  raiseY:         1.15,    // how high the bot sits once on the platform — TUNE to your charge-station GLB
  climbMs:        650,     // climb-on animation duration
  engagedColor:   0xffc83d, // gold ring = ENGAGED (balanced)
  dockColor:      0x5ad1ff, // cyan ring = DOCKED (on, not balanced)
  // Carried game piece: where a picked-up cone/cube rides on the bot
  carryY:         1.25,
  carryZ:         0.55,
  carryScale:     0.7,
};

// ============================================================
//  GRID PLACEMENT — where a scored piece ends up (TUNE to your grid GLB)
// ============================================================
//  Base tiers, then optional PER-PIECE overrides (cones and cubes sit at
//  different heights on the real rack). A piece resolves:
//    base = GRID_PLACEMENT[tier]  →  override = GRID_PLACEMENT[kind][tier]
//  Any field you set in the override wins; omit a field to inherit.
//   dy    = resting height (L2/HIGH up in the rack, L1/MID lower)
//   dInto = nudge INTO the grid from the node hex (toward the wall)
//   dSide = sideways nudge along the wall (+ = toward higher rows)
//  THE THREE AXES (every value tunable, per piece, per tier):
//   dy    = UP            — resting height in the rack
//   dInto = LONG AXIS     — toward/away from the grid wall, along the field's
//                           wide side. Mirrored automatically: positive moves
//                           BOTH alliances' pieces deeper into their own grid,
//                           negative pulls them out toward the field.
//   dSide = ALONG THE WALL — slides the piece sideways along the grid face.
export const GRID_PLACEMENT = {
  L1: { dy: 0.10, dInto: 0.20, dSide: 0 },   // MID row base
  L2: { dy: 1.15, dInto: 0.60, dSide: 0 },   // HIGH row base

  // Per-piece overrides — any field set here beats the base tier value.
  cone: {
    L1: { dy: 1.8, dInto: -0.8, dSide: 0 },   // ← TUNE cone MID
    L2: { dy: 3.2, dInto: 0.60, dSide: 0 },   // ← TUNE cone HIGH
  },
  cube: {
    L1: { dy: 1, dInto: 1.2, dSide: 0 },   // ← TUNE cube MID
    L2: { dy: 2, dInto: 2.3, dSide: 0 },   // ← TUNE cube HIGH
  },
};

// ============================================================
//  TIMING — pacing of the auton
// ============================================================
//  Lower numbers = snappier / faster. Higher = more dramatic / slower.

export const TIMING = {
  // Movement
  tickDuration:        380,    // ms per hex-to-hex move

  // Bot rotation (Tank/WC turn before moving; all bots turn before shots)
  rotationBaseMs:      180,    // base time for any rotation
  rotationPerRadian:   140,    // additional time per radian of turn
  rotateBeforeMove:    true,   // Tank/WC turn to face direction of movement

  // Countdown (3-2-1-GO)
  countdownStepMs:     560,    // gap between countdown numbers
  countdownNumberMs:   600,    // how long each number is held

  // Phase pacing (between major phases)
  postMovementMs:      200,
  postDisruptorMs:     200,
  postParkMs:          200,
  postDefensiveMs:     200,

  // Shots
  shotAimMs:           380,    // crosshair phase before ball release
  shotBetweenMs:       250,    // pause between consecutive shots
  parkScorePauseMs:    280,
  defensiveSetPauseMs: 220,

  // Disruptor
  disruptorBannerMs:   900,
  disruptorPostMs:     900,    // hold after streak fires
};

// ============================================================
//  AUDIO — synth match sound effects (see src/audio.js)
// ============================================================
//  Every sound is generated by a tiny oscillator; nothing is loaded
//  from a file. Tune levels here, save, dev server hot-reloads.
//
//  muteByDefault:true means the match starts silent so you're not
//  beeped at on load — flip the SOUND toggle in the match top bar.

export const AUDIO = {
  muteByDefault: false,   // start unmuted; toggle with the top-bar SOUND button
  master:        0.6,     // overall volume (0..1), applied on the master bus

  // Per-sound volume multipliers (0..1). Set any to 0 to silence just that one.
  volumes: {
    countdownBeep: 0.5,
    countdownGo:   0.7,
    move:          0.25,
    pickup:        0.5,
    disruptor:     0.6,
    shotWhoosh:    0.45,
    hit:           0.8,
    miss:          0.5,
    score:         0.6,
    park:          0.6,
    final:         0.8,

    // ---- added v0.7 (Charged Up + match polish) ----
    place:         0.65,   // cone/cube settles into the rack
    fumble:        0.5,    // bobbled placement
    climb:         0.6,    // charge-station climb ratchet
    fanfare:       0.7,
    cheer:         0.55,   // crowd swell (engaged / final banner)    // ENGAGED! brass stab
  },

  // How much to randomize the movement whir pitch (0 = none, 1 = ±100%).
  movePitchJitter: 0.3,
};

// ============================================================
// ============================================================
//  v0.7 ADDITIONS BELOW — broadcast-cut camera, bloom, carried
//  pieces, recap card, finale. Everything above is untouched.
//  Each block has an `enabled` kill switch.
// ============================================================
// ============================================================

// ------------------------------------------------------------
//  CAMERA DIRECTOR — the "broadcast cut" camera that pushes in
//  on placements, jams, and climbs, then returns to your preset.
// ------------------------------------------------------------
export const CAMERA_DIRECTOR = {
  enabled:      true,
  respectOrbit: true,    // never hijack the camera while FREE ORBIT preset is active
  moveMs:       850,     // fly duration per cut

  // Framing per zoom level: distance from subject + camera height.
  zoom: {
    close: { dist: 13, height: 7.5 },
    mid:   { dist: 20, height: 11  },
    wide:  { dist: 30, height: 16  },
    shot:  { dist: 20, height: 13.5 },  // ← TUNE: Rapid React shooter framing (bot + ball arc + hub)
  },
};

// ------------------------------------------------------------
//  BLOOM — post-processing glow on emissive surfaces (hub halo,
//  cargo dots, pins, rings). Auto-falls-back to plain rendering
//  if the GPU/context can't build the composer.
// ------------------------------------------------------------
export const BLOOM = {
  enabled:   true,
  strength:  0.4,     // 0.2 subtle → 0.8 neon
  radius:    0.55,
  threshold: 0.82,    // only pixels brighter than this bloom
};

// ------------------------------------------------------------
//  CARRIED PIECE — the visible cone/cube riding on a bot
//  (preloads + midfield pickups in placement challenges).
// ------------------------------------------------------------
export const CARRIED_PIECE = {
  enabled: true,
  forward: 0.55,   // local +X offset (in front of the bot)
  height:  1.05,   // local Y (how high it rides)
  scale:   0.65,   // piece scale while carried (1 = full size)
};

// ------------------------------------------------------------
//  RECAP — the AUTON RECAP card after the final tally.
// ------------------------------------------------------------
export const RECAP = {
  enabled:    true,
  autoShowMs: 1100,   // delay after COMPLETE before the card slides in
};

// ------------------------------------------------------------
//  FINALE — confetti fireworks on the final banner.
// ------------------------------------------------------------
export const FINALE = {
  fireworks: true,
  bursts:    6,      // number of confetti bursts
  spreadMs:  1400,   // staggered across this window
};

// ------------------------------------------------------------
//  INTRO — the MATCH PREVIEW lineup card (v0.8). Appears the
//  moment RUN is pressed; assets load behind it; the gold
//  START MATCH button arms when the field is ready.
// ------------------------------------------------------------
export const INTRO = {
  enabled: true,
};

// ------------------------------------------------------------
//  ARENA — stadium dressing (v0.8): score-reactive LED ribbon
//  around the field, corner pylons, and the stage spotlight
//  that follows the broadcast focus. All emissive geometry —
//  no extra lights, and bloom makes the ribbon sing.
// ------------------------------------------------------------
export const ARENA = {
  enabled: true,
  margin:  0.9,                  // gap between field edge and the ribbon

  led: {
    height:        0.16,
    thickness:     0.28,
    baseColor:     0xffb627,     // idle gold
    red:           0xe63946,     // pulse colors on score_update
    blue:          0x1e88e5,
    baseIntensity: 0.7,
    pulseBoost:    1.8,          // added intensity on a score pulse
    breath:        0.08,         // idle breathing depth (0 = static)
  },

  pylons: {
    enabled:   true,
    height:    2.6,
    color:     0xffb627,
    intensity: 0.5,
  },

  stage: {
    enabled: true,
    radius:  1.55,
    color:   0xffd23f,
    opacity: 0.16,               // disc opacity (ring runs ~2.6× this)
  },
};

// ------------------------------------------------------------
//  FFWD — the ▸▸ fast-forward toggle in the match top bar (v0.9).
//  Speeds every pause, tween, bot move, banner, and camera flight.
// ------------------------------------------------------------
export const FFWD = {
  enabled: true,
  mult:    3,        // playback multiplier while engaged
};

// ------------------------------------------------------------
//  COMMAND DECK — setup screen layout (v0.9). The alliances face
//  off in two columns (RED | BLUE) under the mission rail
//  (challenge → projected auto), with the playbook demoted to a
//  collapsed reference at the bottom. Set enabled:false to fall
//  back to the original single-column flow.
// ------------------------------------------------------------
export const COMMAND_DECK = {
  enabled:    true,
  breakpoint: 980,   // px — below this, columns stack again
};
