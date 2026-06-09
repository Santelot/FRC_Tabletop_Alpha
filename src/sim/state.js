// ============================================================
//  GAME STATE — builds the per-match state object from the form config
// ============================================================

import { BOT_IDS, ACTIVE_CHALLENGE } from '../config.js';
import { computePiecePositions, START_POS } from './hex.js';
import { CHALLENGE_CARDS } from '../challenges.js';

/** Start hex for a bot id, from the active challenge card (START_POS fallback). */
function startHex(id) {
  const starts = CHALLENGE_CARDS[ACTIVE_CHALLENGE]?.starts;
  if (starts) {
    const arr = id[0] === 'R' ? starts.red : starts.blue;
    const c = arr?.[Number(id[1]) - 1];
    if (c) return { col: c[0], row: c[1] };
  }
  return { ...START_POS[id] };
}

/**
 * Build initial game state for a match.
 *
 *   formConfig: { R1: { drivetrain, scoring, intake, climber, script }, ... }
 *
 * Returns:
 *   {
 *     bots: { R1: { ...formConfig.R1, alliance, pos, maxCargo, heldCargo,
 *                   shotsTaken, points, disrupted, target, lastPos }, ... },
 *     pieces: [{ id, pos, taken }, ...]
 *   }
 *
 * The state object is the single source of truth during the auton.
 * Both the simulation and the renderer read from it.
 */
export function buildGameState(formConfig) {
  const bots = {};

  for (const id of BOT_IDS) {
    const cfg = formConfig[id];
    const alliance = id[0] === 'R' ? 'red' : 'blue';

    // Capacity: L1 intake = 1 cargo, L2/L3 = 2 (hard cap of 2 per Phase 4)
    const maxCargo = cfg.intake >= 2 ? 2 : 1;

    bots[id] = {
      ...cfg,
      id,
      alliance,
      pos:        startHex(id),
      lastPos:    null,
      maxCargo,
      heldCargo:  1,        // every bot preloads 1 cargo
      shotsTaken: 0,
      points:     0,
      disrupted:  false,
      target:     null,     // set by planTarget() during auton
      atTarget:   false,
    };
  }

  const card = CHALLENGE_CARDS[ACTIVE_CHALLENGE];
  let pieces;
  if (card && card.scoringModel !== 'shooter' && card.neutralPieces) {
    // Charged Up: neutral cones + cubes (ids must match render pieces in pieces.js)
    pieces = [];
    (card.neutralPieces.cones || []).forEach(([c, r], i) =>
      pieces.push({ id: `cone-${i}`, kind: 'cone', pos: { col: c, row: r }, taken: false }));
    (card.neutralPieces.cubes || []).forEach(([c, r], i) =>
      pieces.push({ id: `cube-${i}`, kind: 'cube', pos: { col: c, row: r }, taken: false }));
  } else {
    pieces = computePiecePositions();
  }

  return { bots, pieces };
}
