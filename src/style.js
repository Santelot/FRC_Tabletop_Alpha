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
  // Position relative to bot center
  yOffset:        1.6,
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