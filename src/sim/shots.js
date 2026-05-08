// ============================================================
//  SHOTS — probability rolls and disruptor target selection
// ============================================================

import { SCORING_ACCURACY, BOT_IDS } from '../config.js';
import { hexDist } from './hex.js';

const rand = (lo, hi) => Math.floor(Math.random() * (hi - lo + 1)) + lo;

/**
 * Roll a shot. If the bot is disrupted, roll twice and take the worse
 * (higher) result.
 *
 * Returns: { rolls: [int, int?], finalRoll, hit, accuracy }
 */
export function rollShot(scoring, disrupted) {
  const accuracy = SCORING_ACCURACY[scoring];
  const r1 = rand(1, 100);
  if (!disrupted) {
    return { rolls: [r1], finalRoll: r1, hit: r1 <= accuracy, accuracy };
  }
  const r2 = rand(1, 100);
  const finalRoll = Math.max(r1, r2);
  return { rolls: [r1, r2], finalRoll, hit: finalRoll <= accuracy, accuracy };
}

/**
 * Find the closest opposing shooter for a disruptor bot to target.
 * Returns the target bot or null if no opposing shooters exist.
 */
export function findDisruptorTarget(disruptorBot, state) {
  const candidates = BOT_IDS
    .map(id => state.bots[id])
    .filter(b =>
      b.alliance !== disruptorBot.alliance &&
      ['quick_score', 'triple_threat'].includes(b.script)
    );
  if (candidates.length === 0) return null;
  candidates.sort((a, b) =>
    hexDist(disruptorBot.pos, a.pos) - hexDist(disruptorBot.pos, b.pos)
  );
  return candidates[0];
}

/**
 * Helper: format a roll for log display.
 *   rollDisplay({rolls:[67,89], finalRoll:89}) → "67/89 → 89"
 *   rollDisplay({rolls:[42], finalRoll:42}) → "42"
 */
export function rollDisplay(roll) {
  return roll.rolls.length > 1
    ? `${roll.rolls[0]}/${roll.rolls[1]} → ${roll.finalRoll}`
    : `${roll.finalRoll}`;
}
