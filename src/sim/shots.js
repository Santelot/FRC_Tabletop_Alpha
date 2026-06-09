// ============================================================
//  SHOTS — probability rolls and disruptor target selection
// ============================================================

import { SCORING_ACCURACY, STEADIED_ACCURACY, DISRUPT_TIER_DROP, BOT_IDS } from '../config.js';
import { hexDist } from './hex.js';

const rand = (lo, hi) => Math.floor(Math.random() * (hi - lo + 1)) + lo;

/**
 * Roll a shot.
 *   opts.steadied  — Quick Score's set shot: fires one scoring band sharper.
 *   opts.disrupted — Disruptor: knock the shooter down DISRUPT_TIER_DROP tiers;
 *                    below L1 the shot is jammed outright (no shot, auto-miss).
 *
 * Returns: { rolls, finalRoll, hit, accuracy, jammed?, disrupted? }
 */
export function rollShot(scoring, opts = {}) {
  const { steadied = false, disrupted = false } = opts;

  if (disrupted) {
    const effTier = scoring - DISRUPT_TIER_DROP;
    if (effTier < 1) {
      // Jammed cold — the disruptor stopped the shot entirely.
      return { rolls: [], finalRoll: 0, hit: false, accuracy: 0, jammed: true, disrupted: true };
    }
    const accuracy = SCORING_ACCURACY[effTier];
    const r = rand(1, 100);
    return { rolls: [r], finalRoll: r, hit: r <= accuracy, accuracy, disrupted: true };
  }

  const accuracy = steadied ? STEADIED_ACCURACY[scoring] : SCORING_ACCURACY[scoring];
  const r = rand(1, 100);
  return { rolls: [r], finalRoll: r, hit: r <= accuracy, accuracy, steadied };
}

/**
 * Pick the disruptor's target: the opposing alliance's BEST shooter
 * (highest scoring tier), breaking ties by proximity.
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
  candidates.sort((a, b) => {
    if (b.scoring !== a.scoring) return b.scoring - a.scoring;           // best shooter first
    return hexDist(disruptorBot.pos, a.pos) - hexDist(disruptorBot.pos, b.pos); // then closest
  });
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
