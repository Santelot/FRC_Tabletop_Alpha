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
