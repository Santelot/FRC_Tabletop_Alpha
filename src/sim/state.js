// ============================================================
//  GAME STATE — builds the per-match state object from the form config
// ============================================================

import { BOT_IDS } from '../config.js';
import { computePiecePositions, START_POS } from './hex.js';

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
      pos:        { ...START_POS[id] },
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

  const pieces = computePiecePositions();

  return { bots, pieces };
}
