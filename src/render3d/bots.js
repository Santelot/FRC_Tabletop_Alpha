// ============================================================
//  BOTS — load drivetrain models, place at start positions, set facing
// ============================================================

import * as THREE from 'three';
import { loadModel } from './loader.js';
import { hexCenter, START_POS } from '../sim/hex.js';
import { BOT_IDS } from '../config.js';

const DRIVETRAIN_MODEL_KEY = {
  tank:       'bot_tank',
  west_coast: 'bot_westcoast',
  mecanum:    'bot_mecanum',
  swerve:     'bot_swerve',
};

/**
 * Loads all six bots according to the given config (matches the form).
 * Returns a Map<botId, Object3D>.
 *
 * config: { R1: { drivetrain, ... }, R2: ..., ... }
 */
export async function loadBots(config) {
  const result = new Map();

  for (const id of BOT_IDS) {
    const cfg = config[id];
    const modelKey = DRIVETRAIN_MODEL_KEY[cfg.drivetrain] || 'bot_tank';
    const alliance = id[0] === 'R' ? 'red' : 'blue';

    const model = await loadModel(modelKey, { alliance });
    model.name = `bot-${id}`;
    model.userData.botId = id;
    model.userData.alliance = alliance;

    // Place at start hex
    const start = START_POS[id];
    const { x, z } = hexCenter(start.col, start.row);
    model.position.set(x, 0, z);

    // Face +X for red bots, -X for blue (so they face toward each other)
    model.rotation.y = alliance === 'red' ? 0 : Math.PI;

    // Tint the bot to alliance color via emissive boost on placeholder bots.
    // (Real models presumably already include alliance bumpers. Skip if not placeholder.)
    // We can detect placeholder by checking userData.isPlaceholder if we set it,
    // but it's fine to just leave real models as-is.

    result.set(id, model);
  }

  return result;
}
