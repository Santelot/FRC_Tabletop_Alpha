// ============================================================
//  PLANNING — target generation + tick-by-tick path planning
// ============================================================
//  Pure functions: input is game state, output is moves. No rendering.
// ============================================================

import {
  ROW_COUNTS, ROWS, hexKey, getNeighbors, hexDist, HUB_KEYS, START_POS,
} from './hex.js';
import { BOT_IDS, DRIVETRAINS } from '../config.js';

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
 */
export function getCurrentObjective(bot, state) {
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
 * Returns: { [botId]: { col, row } }  — the chosen next position for each bot.
 */
export function planTick(state) {
  const ordered = [...BOT_IDS].sort((a, b) =>
    DRIVETRAINS[state.bots[a].drivetrain].initiative -
    DRIVETRAINS[state.bots[b].drivetrain].initiative
  );

  // Future occupancy: starts as everyone's current position. As each bot
  // claims its move, its old hex frees and the new one claims.
  const future = new Set(BOT_IDS.map(id => hexKey(state.bots[id].pos)));
  const moves = {};

  for (const id of ordered) {
    const bot = state.bots[id];
    const objective = getCurrentObjective(bot, state);

    // Already at objective AND objective is the final target → done
    if (bot.pos.col === objective.col && bot.pos.row === objective.row) {
      moves[id] = bot.pos;
      continue;
    }

    // Free up our current hex (we're trying to leave)
    future.delete(hexKey(bot.pos));

    const neighbors = getNeighbors(bot.pos);
    // Hub is impassable (physical structure)
    const free = neighbors.filter(n =>
      !future.has(hexKey(n)) && !HUB_KEYS.has(hexKey(n))
    );

    if (free.length === 0) {
      // Stuck — stay put
      moves[id] = bot.pos;
      future.add(hexKey(bot.pos));
      continue;
    }

    free.sort((a, b) => hexDist(a, objective) - hexDist(b, objective));
    const currentDist = hexDist(bot.pos, objective);
    const minDist = hexDist(free[0], objective);

    // If even the best option backtracks, stay put
    if (minDist > currentDist) {
      moves[id] = bot.pos;
      future.add(hexKey(bot.pos));
      continue;
    }

    // Pick from equally-good options. Prefer hexes we didn't just come
    // from (avoids oscillation around obstacles like the hub).
    const tiedBest = free.filter(n => hexDist(n, objective) === minDist);
    const fresh = bot.lastPos
      ? tiedBest.filter(n => !(n.col === bot.lastPos.col && n.row === bot.lastPos.row))
      : tiedBest;
    const pool = fresh.length > 0 ? fresh : tiedBest;
    const best = pool[Math.floor(Math.random() * pool.length)];

    bot.lastPos = bot.pos;
    moves[id] = best;
    future.add(hexKey(best));
  }
  return moves;
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
 */
export function resolvePickups(state) {
  const pickups = [];
  for (const id of BOT_IDS) {
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
