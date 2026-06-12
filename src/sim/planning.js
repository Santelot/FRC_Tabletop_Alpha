// ============================================================
//  PLANNING — target generation + tick-by-tick path planning
// ============================================================
//  Pure functions: input is game state, output is moves. No rendering.
// ============================================================

import {
  ROW_COUNTS, ROWS, hexKey, getNeighbors, hexDist, HUB_KEYS, START_POS,
} from './hex.js';
import { BOT_IDS, DRIVETRAINS, ACTIVE_CHALLENGE } from '../config.js';
import { CHALLENGE_CARDS } from '../challenges.js';

/** Hexes a bot can't drive onto for the active challenge (solid structures). */
export function impassableKeys() {
  const card = CHALLENGE_CARDS[ACTIVE_CHALLENGE];
  if (!card || card.scoringModel === 'shooter') return HUB_KEYS;   // Rapid React: the hub
  const keys = new Set();                                          // placement: the grids
  for (const side of ['red', 'blue']) {
    const g = card.grid?.[side];
    if (g) [...g.cone, ...g.cube].forEach(([c, r]) => keys.add(hexKey({ col: c, row: r })));
    const cs = card.chargeStation?.[side];                         // and the raised charge station
    if (cs) [...(cs.edges || []), ...(cs.center || [])].forEach(([c, r]) => keys.add(hexKey({ col: c, row: r })));
  }
  return keys;
}

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const rand  = (lo, hi) => Math.floor(Math.random() * (hi - lo + 1)) + lo;

/**
 * Generate a target hex for a bot based on its script.
 * Includes per-match jitter so identical configs play out differently
 * each run.
 */
export function planTarget(bot) {
  const isRed = bot.alliance === 'red';
  const sCol = START_POS[bot.id].col;
  const sRow = START_POS[bot.id].row;
  const reach = DRIVETRAINS[bot.drivetrain].reach;
  const rowJitter = rand(-1, 1);
  let targetRow = clamp(sRow + rowJitter, 1, ROWS - 2);

  let targetCol;
  switch (bot.script) {
    case 'cross_park':
      targetCol = isRed ? 2 + rand(0, 2) : 12 - rand(0, 2);
      break;
    case 'quick_score':
    case 'triple_threat':
      // Shooting ring: cols flanking the hub (which is at col 6-8)
      targetCol = isRed ? 4 + rand(0, 1) : 9 + rand(0, 1);
      break;
    case 'defensive_set':
      // Cross to opponent's side, avoid hub footprint (cols 6-8 rows 3-5)
      targetCol = isRed ? 9 + rand(0, 2) : 3 + rand(0, 2);
      break;
    case 'disruptor':
      targetCol = isRed ? 11 + rand(0, 2) : 1 + rand(0, 2);
      break;
    default:
      targetCol = sCol;
  }

  const rc = ROW_COUNTS[targetRow];
  targetCol = clamp(targetCol, 0, rc - 1);
  return { col: targetCol, row: targetRow };
}

/**
 * For Triple Threat: dynamic next-target. If the bot has cargo capacity
 * and a piece is nearby (small detour), divert through the piece on the
 * way to the final shooting target.
 *
 *  ⚠ SHOOTER-ONLY. Placement autons (Charged Up) steer every leg
 *  explicitly from sim/auton.js — an opportunistic divert there sends
 *  bots wandering toward midfield pieces mid-cycle, which is exactly
 *  the "makes no sense" drift of v4. Placement returns bot.target as-is.
 */
export function getCurrentObjective(bot, state) {
  const card = CHALLENGE_CARDS[ACTIVE_CHALLENGE];
  if (card && card.scoringModel !== 'shooter') return bot.target;

  if (bot.script === 'triple_threat' && bot.heldCargo < bot.maxCargo) {
    const available = state.pieces.filter(p => !p.taken);
    if (available.length > 0) {
      available.sort((a, b) => hexDist(bot.pos, a.pos) - hexDist(bot.pos, b.pos));
      const piece = available[0];
      const distToPiece = hexDist(bot.pos, piece.pos);
      const distFromPieceToFinal = hexDist(piece.pos, bot.target);
      const directDist = hexDist(bot.pos, bot.target);
      // Only divert if the piece isn't a huge detour (≤ 2 extra hexes)
      if (distToPiece + distFromPieceToFinal <= directDist + 2) {
        return piece.pos;
      }
    }
  }
  return bot.target;
}

/**
 * Plan one tick of movement for all bots. Higher initiative goes first
 * (lower initiative number wins). Bots can never end on the same hex,
 * never enter the hub.
 *
 * Pathing (v1.6): each bot BFS-routes to its objective every tick around
 * solid structures and every other bot's claimed hex, then takes the first
 * step of that path. Real detours replace greedy hill-climbing, which used
 * to orbit in pockets (charge station + grid wall + parked teammate).
 * A frustration valve remains as the safety net: 8 ticks without a new
 * best distance and the bot parks where it stands.
 *
 * Returns: { [botId]: { col, row } }  — the chosen next position for each bot.
 */
/**
 * Breadth-first route from `start` to `goal` around `blocked` hexes.
 * Returns the FIRST STEP of the shortest path, or null if no path exists
 * right now (goal walled off or occupied).
 */
function bfsStep(start, goal, blocked) {
  const sk = hexKey(start), gk = hexKey(goal);
  if (sk === gk) return null;
  const cameFrom = new Map([[sk, null]]);
  const queue = [start];
  let found = null;
  while (queue.length) {
    const cur = queue.shift();
    if (hexKey(cur) === gk) { found = cur; break; }
    for (const n of getNeighbors(cur)) {
      const k = hexKey(n);
      if (cameFrom.has(k) || blocked.has(k)) continue;
      cameFrom.set(k, cur);
      queue.push(n);
    }
  }
  if (!found) return null;
  let node = found;
  let parent = cameFrom.get(hexKey(node));
  while (parent && hexKey(parent) !== sk) {
    node = parent;
    parent = cameFrom.get(hexKey(node));
  }
  return node;
}

export function planTick(state) {
  const ordered = [...BOT_IDS].sort((a, b) =>
    DRIVETRAINS[state.bots[a].drivetrain].initiative -
    DRIVETRAINS[state.bots[b].drivetrain].initiative
  );

  // Future occupancy: starts as everyone's current position. As each bot
  // claims its move, its old hex frees and the new one claims.
  const future = new Set(BOT_IDS.map(id => hexKey(state.bots[id].pos)));
  const impassable = impassableKeys();
  const moves = {};

  for (const id of ordered) {
    const bot = state.bots[id];
    const objective = getCurrentObjective(bot, state);

    // Fresh leg? Reset the frustration tracker (best distance achieved).
    const tKey = `${objective.col},${objective.row}`;
    if (bot._targetKey !== tKey) {
      bot._targetKey = tKey;
      bot._bestDist = hexDist(bot.pos, objective);
      bot._frustration = 0;
    }

    // Already at objective AND objective is the final target → done
    if (bot.pos.col === objective.col && bot.pos.row === objective.row) {
      bot._stuck = 0;
      bot._frustration = 0;
      moves[id] = bot.pos;
      continue;
    }

    // Free up our current hex (we're trying to leave)
    future.delete(hexKey(bot.pos));

    // Route around solids AND every other bot's claimed/current hex.
    const blocked = new Set(impassable);
    for (const k of future) blocked.add(k);

    const step = bfsStep(bot.pos, objective, blocked);

    if (!step) {
      // No path exists right now (goal walled off or someone parked on it).
      // Hold position; the frustration valve parks us if it never opens.
      bot._stuck = (bot._stuck || 0) + 1;
      bot._frustration = (bot._frustration || 0) + 1;
      settleIfHopeless(bot);
      moves[id] = bot.pos;
      future.add(hexKey(bot.pos));
      continue;
    }

    bot._stuck = 0;
    // Frustration tracks real progress: only a NEW best distance counts.
    // (BFS detours can legitimately move away from the goal for a while —
    // the 8-tick window in settleIfHopeless gives them room.)
    const nd = hexDist(step, objective);
    if (nd < (bot._bestDist ?? Infinity)) {
      bot._bestDist = nd;
      bot._frustration = 0;
    } else {
      bot._frustration = (bot._frustration || 0) + 1;
      settleIfHopeless(bot);
    }
    bot.lastPos = bot.pos;
    moves[id] = step;
    future.add(hexKey(step));
  }
  return moves;
}

/**
 * A bot that has churned 8 ticks without setting a new best distance is
 * never getting there this phase — park it where it stands so it reads
 * as "holding position" instead of pacing in a pocket.
 */
function settleIfHopeless(bot) {
  if ((bot._frustration || 0) >= 8) {
    bot.target = { col: bot.pos.col, row: bot.pos.row };
    bot._stuck = 0;
    bot._frustration = 0;
  }
}

/**
 * Have all bots reached their final target?
 */
export function allBotsAtTarget(state) {
  return BOT_IDS.every(id => {
    const b = state.bots[id];
    return b.pos.col === b.target.col && b.pos.row === b.target.row;
  });
}

/**
 * After a tick, check if any bots landed on a piece hex and pick it up.
 * Mutates state. Returns array of {botId, pieceId} pickups for the renderer.
 *
 * If `state.pickupEligible` (a Set of botIds) exists, ONLY those bots may
 * pick up pieces. Charged Up sets it during the fetch leg so defenders and
 * jammers crossing midfield don't accidentally vacuum up neutral pieces.
 * Rapid React never sets it, so RR behaviour is unchanged.
 */
export function resolvePickups(state) {
  const pickups = [];
  for (const id of BOT_IDS) {
    if (state.pickupEligible && !state.pickupEligible.has(id)) continue;
    const bot = state.bots[id];
    if (bot.heldCargo >= bot.maxCargo) continue;
    const piece = state.pieces.find(p =>
      !p.taken && p.pos.col === bot.pos.col && p.pos.row === bot.pos.row
    );
    if (piece) {
      piece.taken = true;
      piece.takenBy = id;
      bot.heldCargo += 1;
      pickups.push({ botId: id, pieceId: piece.id });
    }
  }
  return pickups;
}
