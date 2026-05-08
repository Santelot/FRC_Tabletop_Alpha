// ============================================================
//  BOTS — load drivetrain models, place at start positions, set facing
// ============================================================
//  Bot model selection is driven by:
//    drivetrain (tank | west_coast | mecanum | swerve)
//    × alliance (red | blue)
//    × scoring  (shooter | manipulator) — determined by ACTIVE_CHALLENGE
//
//  See botModelKey() in config.js for the key construction.
// ============================================================

import { loadModel } from './loader.js';
import { hexCenter, START_POS } from '../sim/hex.js';
import {
  BOT_IDS, ACTIVE_CHALLENGE, CHALLENGES, botModelKey,
} from '../config.js';

/**
 * Loads all six bots according to the given config (matches the form).
 * Returns a Map<botId, Object3D>.
 *
 * config: { R1: { drivetrain, ... }, R2: ..., ... }
 */
export async function loadBots(config) {
  const result = new Map();

  // The current challenge dictates which scoring variant we load.
  const scoringType = CHALLENGES[ACTIVE_CHALLENGE].scoring;  // 'shooter' or 'manipulator'

  for (const id of BOT_IDS) {
    const cfg = config[id];
    const alliance = id[0] === 'R' ? 'red' : 'blue';
    const modelKey = botModelKey(cfg.drivetrain, alliance, scoringType);

    const model = await loadModel(modelKey, { alliance, drivetrain: cfg.drivetrain });
    model.name = `bot-${id}`;
    model.userData.botId = id;
    model.userData.alliance = alliance;
    model.userData.drivetrain = cfg.drivetrain;
    model.userData.scoringType = scoringType;

    // Place at start hex
    const start = START_POS[id];
    const { x, z } = hexCenter(start.col, start.row);
    model.position.set(x, 0, z);

    // Face the opposing alliance. Red bots start at -X, face +X. Blue bots
    // start at +X, face -X (rotate 180° around Y).
    model.rotation.y = alliance === 'red' ? 0 : Math.PI;

    result.set(id, model);
  }

  return result;
}
