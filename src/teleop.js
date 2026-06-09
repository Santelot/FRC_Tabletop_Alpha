// ============================================================
//  TELEOP — turn-order + scoring state machine
// ============================================================
//  Pure-ish logic for the post-auton tracker. No DOM here; the UI
//  layer (ui/teleop.js) drives this and renders it.
//
//  Turn order each round is decided in two passes:
//    1. Drivetrain tier  — Swerve → West Coast → Tank → Mecanum
//    2. Alliance priority — odd rounds RED goes first, even rounds BLUE
//  If two bots are STILL tied (same drivetrain AND same alliance), that's
//  a free player choice — the UI asks you to tap who goes next.
//
//  NOTE: tierOrder below still differs from DRIVETRAINS[].initiative in
//  config.js (which puts mecanum ahead of tank). One knob to flip if the
//  order is wrong — see the conversation flag.
// ============================================================

import { BOT_IDS, ACTIVE_CHALLENGE } from './config.js';

// ============================================================
//  TUNABLES — balance / pacing / scoring all live here
// ============================================================
export const TELEOP_CONFIG = {
  rounds: 8,
  longPressMs: 500,     // hold a button this long to subtract instead of add
  scoreFloor:  0,       // scores never drop below this

  // Drivetrain turn order, fastest first.
  tierOrder: ['swerve', 'west_coast', 'tank', 'mecanum'],

  // ----------------------------------------------------------
  //  SCORING ACTIONS — this is DATA, on purpose.
  //  Future challenges (more game pieces, more tiers) just edit this
  //  array, or swap it per Challenge Card. The UI renders one button
  //  per entry, so e.g. Charged Up could be:
  //    { id:'cone-mid', label:'CONE · MID', points:3, ... }
  //    { id:'cube-high',label:'CUBE · HIGH',points:5, ... }
  //    { id:'charge',   label:'CHARGE',     points:10, rounds:[7,8], ... }
  //
  //  Fields:
  //   id        unique key
  //   label     button text
  //   points    points added on a normal press
  //   shape     'hub' (trapezoid) | 'climb' | 'plain' — visual style only
  //   undo      true → long-press subtracts `points` (mistake fix)
  //   rounds    null = every round, or [list] of rounds it's allowed in
  //   sound     audio.js key on a normal press
  //   undoSound audio.js key on a long-press undo
  //   hint      small caption under the value
  // ----------------------------------------------------------
  //  ----------------------------------------------------------
  //  SCORING ACTIONS — DATA, switched per active challenge.
  //  Fields:
  //   id, label, points, shape ('hub'|'climb'|'plain'), undo (long-press
  //   subtracts), rounds (null=any | [list]), sound, undoSound, hint,
  //   minScore (button locked unless the on-deck bot's SCORE tier ≥ this).
  //  ----------------------------------------------------------
  get actions() {
    return ACTION_SETS[ACTIVE_CHALLENGE] || ACTION_SETS.rapid_react;
  },

  // Animation pacing (ms)
  timing: { roundFlourish: 1100, winReveal: 420 },
};

const ACTION_SETS = {
  rapid_react: [
    { id: 'hub',   label: 'HUB',   points: 2,  shape: 'hub',   undo: true, rounds: null,   sound: 'score', undoSound: 'miss', hint: 'hold = −2' },
    { id: 'climb', label: 'CLIMB', points: 10, shape: 'climb', undo: true, rounds: [7, 8], sound: 'hit',   undoSound: 'miss', hint: 'endgame · R7–8' },
  ],
  charged_up: [
    { id: 'cone_high', label: 'CONE ▲', points: 5,  shape: 'hub',   undo: true, rounds: null,   sound: 'score', undoSound: 'miss', hint: 'high · needs Score L2+', minScore: 2 },
    { id: 'cone_mid',  label: 'CONE',   points: 3,  shape: 'plain', undo: true, rounds: null,   sound: 'score', undoSound: 'miss', hint: 'mid' },
    { id: 'cube_high', label: 'CUBE ▲', points: 5,  shape: 'hub',   undo: true, rounds: null,   sound: 'score', undoSound: 'miss', hint: 'high · needs Score L2+', minScore: 2 },
    { id: 'cube_mid',  label: 'CUBE',   points: 3,  shape: 'plain', undo: true, rounds: null,   sound: 'score', undoSound: 'miss', hint: 'mid' },
    { id: 'dock',      label: 'DOCK',   points: 6,  shape: 'climb', undo: true, rounds: [7, 8], sound: 'hit',   undoSound: 'miss', hint: 'endgame · per bot' },
    { id: 'engage',    label: 'ENGAGE', points: 10, shape: 'climb', undo: true, rounds: [7, 8], sound: 'hit',   undoSound: 'miss', hint: 'balanced · per bot' },
  ],
};

/** Is this action usable in the given round? */
export function actionAvailable(action, round) {
  return !action.rounds || action.rounds.includes(round);
}

// ============================================================
//  STATE
// ============================================================
export function createTeleopState(initialScores = { red: 0, blue: 0 }) {
  return {
    round: 1,
    actedThisRound: new Set(),   // botIds that have finished their turn this round
    activeBot: null,             // botId currently up (null = unresolved / pending choice)
    scores: { red: initialScores.red | 0, blue: initialScores.blue | 0 },
    finished: false,
    winner: null,                // 'red' | 'blue' | 'tie'
  };
}

function tierIndex(drivetrain) {
  const i = TELEOP_CONFIG.tierOrder.indexOf(drivetrain);
  return i < 0 ? 99 : i;
}

// odd round → red ranks 0 (first); even round → blue ranks 0 (first)
function allianceRank(alliance, round) {
  const redFirst = round % 2 === 1;
  if (redFirst) return alliance === 'red' ? 0 : 1;
  return alliance === 'blue' ? 0 : 1;
}

function keyOf(bot, round) {
  return [tierIndex(bot.drivetrain), allianceRank(bot.alliance, round)];
}

/**
 * Bots eligible to go NEXT, tied at the front of the order.
 *   length 1 → that bot goes automatically
 *   length >1 → free choice (same drivetrain + same alliance); UI asks
 *   length 0 → round is complete
 */
export function nextCandidates(config, state) {
  const remaining = BOT_IDS.filter(id => !state.actedThisRound.has(id));
  if (remaining.length === 0) return [];

  const keyed = remaining.map(id => ({ id, key: keyOf(config[id], state.round) }));
  keyed.sort((a, b) => a.key[0] - b.key[0] || a.key[1] - b.key[1]);
  const [t, r] = keyed[0].key;
  return keyed.filter(k => k.key[0] === t && k.key[1] === r).map(k => k.id);
}

/** Remaining bots in resolved order (for the "up next" queue). Excludes active. */
export function upcomingOrder(config, state) {
  return BOT_IDS
    .filter(id => !state.actedThisRound.has(id) && id !== state.activeBot)
    .sort((a, b) => {
      const ka = keyOf(config[a], state.round);
      const kb = keyOf(config[b], state.round);
      return ka[0] - kb[0] || ka[1] - kb[1];
    });
}

export function setActive(state, botId) {
  state.activeBot = botId;
}

/** Finish the active bot's turn. Returns true if that completed the round. */
export function endTurn(state) {
  if (state.activeBot) state.actedThisRound.add(state.activeBot);
  state.activeBot = null;
  return roundComplete(state);
}

export function roundComplete(state) {
  return BOT_IDS.every(id => state.actedThisRound.has(id));
}

/** Move to the next round, or mark finished after the last one. */
export function advanceRound(state) {
  if (state.round >= TELEOP_CONFIG.rounds) {
    state.finished = true;
    return false;
  }
  state.round += 1;
  state.actedThisRound = new Set();
  return true;
}

export function applyScore(state, alliance, delta) {
  state.scores[alliance] = Math.max(TELEOP_CONFIG.scoreFloor, state.scores[alliance] + delta);
  return state.scores[alliance];
}

export function computeWinner(state) {
  const { red, blue } = state.scores;
  state.winner = red === blue ? 'tie' : red > blue ? 'red' : 'blue';
  return state.winner;
}
