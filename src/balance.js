// ============================================================
//  BALANCE — THE TUNING TABLE
// ============================================================
//  Every point value in the game lives HERE and only here.
//  Auton values feed the Challenge Cards (simulation, Pit Wall
//  EV projections, and playbook copy all read from the cards,
//  so they update automatically). Teleop values feed the
//  driver-station keypad.
//
//  Change a number → rebuild → done. ← TUNE freely.
// ============================================================

export const BALANCE = {
  rapid_react: {
    auton: {
      hubHit:   4,    // ← TUNE: points per cargo scored in the hub (auto)
      mobility: 2,    // ← TUNE: taxi / cross & park
      climb:    10,   // ← TUNE: hangar climb (auto)
    },
    teleop: {
      hub:   2,       // ← TUNE: per cargo scored in teleop
      climb: 10,      // ← TUNE: endgame climb (R7–8)
    },
  },

  charged_up: {
    auton: {
      high:     5,    // ← TUNE: HIGH placement (auto)
      mid:      3,    // ← TUNE: MID placement (auto)
      mobility: 3,    // ← TUNE: leave community
      dock:     8,    // ← TUNE: DOCKED on the charge station (auto)
      engage:   12,   // ← TUNE: ENGAGED / balanced (auto)
    },
    teleop: {
      high:   5,      // ← TUNE: HIGH placement (teleop)
      mid:    3,      // ← TUNE: MID placement (teleop)
      dock:   6,      // ← TUNE: DOCKED (R7–8, per bot)
      engage: 10,     // ← TUNE: ENGAGED (R7–8, per bot)
    },
  },
};

// ============================================================
//  RULES — match-rule toggles
// ============================================================
export const RULES = {
  // false = NO mobility/taxi points anywhere (auton awards AND the
  // Pit Wall EV projections stay consistent automatically).
  mobilityEnabled: false,   // ← TUNE: flip to true to bring mobility back
};

// ============================================================
//  BUILD_COSTS — the Pit Wall point-buy table (added v1.7)
// ============================================================
//  Every stat's Build Point (BP) cost lives HERE and only here.
//  The Pit Wall reads this table for three things:
//   • the BP shown next to every stat option in the selects
//   • the live BP-spent chip on each bot card
//   • RANDOMIZE, which now only deals builds that fit the budget
//
//  Keys under drivetrain must match the keys in config.js →
//  DRIVETRAINS exactly (mecanum / tank / west_coast / swerve).
//  Keys under scoring/intake/climber are the numeric levels.
//
//  Change a number → rebuild → done. ← TUNE freely.
// ============================================================
export const BUILD_COSTS = {
  budget: 20,   // ← TUNE: starting Build Points per bot

  drivetrain: {
    mecanum:    2,   // ← TUNE: Mecanum  (omni,  1 hex/AP)
    tank:       3,   // ← TUNE: Tank     (directional, 1 hex/AP)
    west_coast: 5,   // ← TUNE: West Coast (directional, 2 hex/AP)
    swerve:     9,   // ← TUNE: Swerve   (omni,  2 hex/AP)
  },

  scoring: {
    1: 2,   // ← TUNE: Scoring L1
    2: 4,   // ← TUNE: Scoring L2
    3: 7,   // ← TUNE: Scoring L3
  },

  intake: {
    1: 1,   // ← TUNE: Intake L1
    2: 3,   // ← TUNE: Intake L2
    3: 6,   // ← TUNE: Intake L3
  },

  climber: {
    0: 0,   // ← TUNE: Climber L0 (no climb)
    1: 2,   // ← TUNE: Climber L1
    2: 4,   // ← TUNE: Climber L2
    3: 7,   // ← TUNE: Climber L3
  },
};