// ============================================================
//  CHALLENGE CARDS — full per-game definition (refactor Step 1)
// ============================================================
//  Each card fully describes one game: field-element coordinates
//  (hex [col, row]), the scoring model, endgame, mobility, the
//  per-auton behaviours, and the teleop tracker actions.
//
//  This is the foundation for retiring the hard-coded Rapid React
//  constants. It is ADDITIVE — nothing imports it yet, so the live
//  app is unchanged. Subsequent steps migrate field rendering,
//  planning/auton, scoring, and the teleop tracker to read from
//  the active card here.
//
//  Coordinates match hex.js: [col, row]; red on the low-col (left)
//  side, blue on the high-col (right) side, row 0 far / row 8 near.
//
//  NEW (v0.7): `scriptCopy` — per-challenge overrides for the auton
//  playbook text. The base SCRIPTS in config.js are Rapid React
//  (shooter) flavoured; a placement card overrides label/desc/detail/
//  scores/tip so the setup screen reads correctly for its game.
//  ui/setup.js merges these live when the challenge changes.
// ============================================================

import { BALANCE } from './balance.js';

const RR_B = BALANCE.rapid_react;
const CU_B = BALANCE.charged_up;

export const CHALLENGE_CARDS = {

  // ----------------------------------------------------------
  rapid_react: {
    id: 'rapid_react',
    label: 'Rapid React',
    scoringModel: 'shooter',
    models: { field: 'field_rapidreact', hub: 'hub_rapidreact', cargo: 'cargo_rapidreact' },

    starts: {
      red:  [[0, 2], [0, 4], [0, 6]],
      blue: [[14, 2], [14, 4], [14, 6]],
    },

    // central shared scoring structure
    hub: {
      center: [7, 4],
      hexes:  [[7, 4], [6, 4], [8, 4], [7, 3], [8, 3], [7, 5], [8, 5]],
    },

    scoring: {
      kind: 'shoot',
      points: { hit: RR_B.auton.hubHit },
      accuracy: { 1: 50, 2: 75, 3: 90 },    // by SCORE tier
      steadied: { 1: 75, 2: 90, 3: 95 },    // Quick Score: one band sharper
    },

    mobility: { points: RR_B.auton.mobility },      // taxi (Cross & Park)

    endgame: {
      kind: 'climb',
      rounds: [7, 8],
      points: RR_B.auton.climb,
      capability: { 0: 'none', 1: 'low', 2: 'mid', 3: 'high' },
    },

    // how each auton resolves in this game
    scripts: {
      cross_park:    { kind: 'mobility' },
      quick_score:   { kind: 'score', shots: 1, steadied: true },
      triple_threat: { kind: 'score', shots: 2, intakeGate: 2 },
      defensive_set: { kind: 'pin' },
      disruptor:     { kind: 'jam' },
    },

    // teleop tracker buttons (consumed when the tracker is data-driven)
    teleop: {
      actions: [
        { id: 'hub',   label: 'HUB',   points: RR_B.teleop.hub,   undoLongPress: true },
        { id: 'climb', label: 'CLIMB', points: RR_B.teleop.climb, rounds: [7, 8] },
      ],
    },
  },

  // ----------------------------------------------------------
  charged_up: {
    id: 'charged_up',
    label: 'Charged Up',
    scoringModel: 'manipulator',
    models: {
      field:         'field_chargedup',
      chargeStation: { red: 'chargestation_red_chargedup', blue: 'chargestation_blue_chargedup' },
      grid:          { red: 'grid_red_chargedup', blue: 'grid_blue_chargedup' },
      cone:          'cone_chargedup',
      cube:          'cube_chargedup',
    },

    starts: {
      red:  [[1, 0], [1, 2], [1, 4]],
      blue: [[13, 0], [13, 2], [13, 4]],
    },

    feeders: {
      red:  [[0, 6], [0, 7], [0, 8]],
      blue: [[14, 6], [15, 7], [14, 8]],
    },

    // Scoring grid — cone nodes are the single-hex rows, cube nodes are the
    // two-hex rows. NOTE: cube nodes are encoded one-per-hex (6 cube nodes).
    // If a two-hex cube row should instead be ONE wide node (→ 3 cube nodes),
    // collapse each pair here — it's a one-line change per alliance.
    grid: {
      red: {
        cone: [[0, 0], [0, 2], [0, 4]],
        cube: [[0, 1], [1, 1], [0, 3], [1, 3], [0, 5], [1, 5]],
      },
      blue: {
        cone: [[14, 0], [14, 2], [14, 4]],
        cube: [[14, 1], [15, 1], [14, 3], [15, 3], [14, 5], [15, 5]],
      },
    },

    // Shared alliance charge station: edge rows + a center balance hex.
    chargeStation: {
      red:  { edges: [[3, 2], [4, 2], [3, 4], [4, 4]], center: [[4, 3]] },
      blue: { edges: [[10, 2], [11, 2], [10, 4], [11, 4]], center: [[11, 3]] },
    },

    allianceZone: {
      red:  [[1,0],[2,0],[3,0],[2,1],[3,1],[4,1],[1,2],[2,2],[2,3],[3,3],[1,4],[2,4],[2,5],[3,5]],
      blue: [[11,0],[12,0],[13,0],[11,1],[12,1],[13,1],[12,2],[13,2],[12,3],[13,3],[12,4],[13,4],[12,5],[13,5]],
    },

    // Neutral auto pieces at midfield (cols 6 & 8).
    neutralPieces: {
      cones: [[6, 0], [8, 0], [6, 4], [8, 4], [6, 8], [8, 8]],
      cubes: [[6, 2], [8, 2], [6, 6], [8, 6]],
    },

    scoring: {
      kind: 'place',
      points: { high: CU_B.auton.high, mid: CU_B.auton.mid },   // tier; HIGH requires SCORE >= highMinScore
      highMinScore: 2,
      accuracy: { 1: 50, 2: 75, 3: 90 },    // placement "bobble" roll, by SCORE tier
      steadied: { 1: 75, 2: 90, 3: 95 },    // Quick Score (Place Preload)
      pieceMatch: true,                     // cones -> cone nodes, cubes -> cube nodes
    },

    mobility: { points: CU_B.auton.mobility },      // leave community

    // Shared charge station — scores in BOTH auto and endgame.
    endgame: {
      kind: 'charge',
      rounds: [7, 8],
      points: {
        dock:   { auto: CU_B.auton.dock,   teleop: CU_B.teleop.dock   },
        engage: { auto: CU_B.auton.engage, teleop: CU_B.teleop.engage },
      },
      // CLIMB tier -> where a bot may sit on the station
      capability: { 0: 'none', 1: 'none', 2: 'edge', 3: 'any' },
      // ENGAGED (balanced) rule, by count of bots on the station:
      //   1 bot  -> engaged only if at center
      //   2 bots -> engaged if both on edges (neither at center)
      //   3 bots -> engaged
      //   anything else (unbalanced) -> docked
      balance: { 1: 'center', 2: 'edges', 3: 'any' },
    },

    scripts: {
      cross_park:    { kind: 'charge' },    // drive to the charge station; CLIMB 0/1 just park (mobility)
      quick_score:   { kind: 'score', shots: 1, steadied: true },
      triple_threat: { kind: 'score', shots: 2, intakeGate: 2 },
      defensive_set: { kind: 'pin' },
      disruptor:     { kind: 'jam' },
    },

    // ----------------------------------------------------------
    //  Per-challenge auton copy. Any field omitted here falls back
    //  to the base SCRIPTS text in config.js.
    // ----------------------------------------------------------
    scriptCopy: {
      cross_park: {
        label:  'Cross & Charge',
        desc:   'Drive up and dock on the charge station.',
        detail: 'Stage by your charge station and climb it before the buzzer. CLIMB L2 docks an edge; CLIMB L3 can take the center hex and balance solo. CLIMB 0\u20131 can\u2019t climb \u2014 it just leaves the community for mobility.',
        scores: `+${CU_B.auton.dock} DOCK / +${CU_B.auton.engage} ENGAGED in auto  \u00b7  +${CU_B.auton.mobility} mobility fallback`,
        tip:    'The anchor play. One L3 climber alone can ENGAGE the center; two L2s balancing the edges ENGAGE together.',
      },
      quick_score: {
        label:  'Place Preload',
        desc:   'Place the preloaded piece \u2014 steadied hands.',
        detail: 'Place your preloaded cone or cube straight from the start with steadied accuracy (L1\u219275%, L2\u219290%, L3\u219295%), then cross the community line for mobility.',
        scores: `+${CU_B.auton.high} HIGH / +${CU_B.auton.mid} MID  \u00b7  +${CU_B.auton.mobility} mobility  \u00b7  steadied 75/90/95%`,
        tip:    'The reliable opener. Score L2+ reaches the HIGH row for +5; below that it places MID.',
      },
      triple_threat: {
        label:  'Double Cycle',
        desc:   'Place the preload, fetch a second piece, place again \u2014 then climb.',
        detail: 'Place your preload, sprint to midfield for a second piece, return and place it at base accuracy \u2014 then climb the charge station if your CLIMB allows. The second piece needs INTAKE L2+ to carry.',
        scores: `up to +${CU_B.auton.high * 2} placed  \u00b7  +${CU_B.auton.dock}/+${CU_B.auton.engage} charge  \u00b7  base 50/75/90%`,
        tip:    'The ceiling play. With CLIMB L2+ this is the biggest auto in the game \u2014 but every leg of it can slip.',
      },
      defensive_set: {
        label:  'Defensive Set',
        desc:   'Contest the enemy cycle lane with pins.',
        detail: 'Cross to the enemy\u2019s midfield cycle lane and drop blocking pins on the hexes their cyclers need. Grids, zones, and charge stations are protected \u2014 the open lane is fair game.',
        scores: '0 direct  \u00b7  chokes their second-cycle lane',
        tip:    'Aim it at an enemy Double Cycle \u2014 pins between the pieces and their grid hurt the most.',
      },
      disruptor: {
        label:  'Disruptor',
        desc:   'Jam the enemy\u2019s best placer before it scores.',
        detail: 'Zap the opposing alliance\u2019s best placer right off the start: its next placement drops one accuracy tier and loses any steadied bonus.',
        scores: '0 direct  \u00b7  their ace drops a full accuracy band',
        tip:    'Fire it at their steadied preload \u2014 turning a 95% into a 75% swings real points.',
      },
    },

    teleop: {
      actions: [
        { id: 'cone_high', label: 'CONE \u25B2', points: CU_B.teleop.high, tier: 'high', piece: 'cone' },
        { id: 'cone_mid',  label: 'CONE',       points: CU_B.teleop.mid,  tier: 'mid',  piece: 'cone' },
        { id: 'cube_high', label: 'CUBE \u25B2', points: CU_B.teleop.high, tier: 'high', piece: 'cube' },
        { id: 'cube_mid',  label: 'CUBE',       points: CU_B.teleop.mid,  tier: 'mid',  piece: 'cube' },
        { id: 'charge',    label: 'CHARGE STATION', kind: 'charge', rounds: [7, 8] },
      ],
    },
  },
};

export const CHALLENGE_IDS = Object.keys(CHALLENGE_CARDS);

/** Total scoring nodes for a Charged Up alliance side ('red' | 'blue'). */
export function gridNodeCount(card, side) {
  const g = card.grid?.[side];
  return g ? g.cone.length + g.cube.length : 0;
}
