// ============================================================
//  BOTS — load drivetrain models, place at start positions, set facing,
//         attach cargo indicators
// ============================================================

import * as THREE from 'three';

import { loadModel } from './loader.js';
import { hexCenter, START_POS } from '../sim/hex.js';
import {
  BOT_IDS, ACTIVE_CHALLENGE, CHALLENGES, botModelKey,
} from '../config.js';
import { CHALLENGE_CARDS } from '../challenges.js';
import { CARGO_INDICATORS } from '../style.js';

/** Start hex for a bot id, read from the active challenge card (START_POS fallback). */
function startHex(id) {
  const starts = CHALLENGE_CARDS[ACTIVE_CHALLENGE]?.starts;
  if (starts) {
    const arr = id[0] === 'R' ? starts.red : starts.blue;
    const coord = arr?.[Number(id[1]) - 1];
    if (coord) return { col: coord[0], row: coord[1] };
  }
  return START_POS[id];
}

/**
 * Loads all six bots according to the given config.
 * Returns a Map<botId, Object3D>.
 */
export async function loadBots(config) {
  const result = new Map();
  const scoringType = CHALLENGES[ACTIVE_CHALLENGE].scoring;

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

    // Cargo indicator dots are a Rapid React (shooter) affordance. Placement
    // challenges carry the real cone/cube instead, so skip the spheres there.
    const card = CHALLENGE_CARDS[ACTIVE_CHALLENGE];
    const isShooter = !card || card.scoringModel === 'shooter';
    if (CARGO_INDICATORS.enabled && isShooter) {
      const indicator = buildCargoIndicator();
      model.add(indicator);
      model.userData.cargoIndicator = indicator;
    }

    // Place at start hex (from the active challenge card)
    const start = startHex(id);
    const { x, z } = hexCenter(start.col, start.row);
    model.position.set(x, 0, z);

    // Face the opposing alliance.
    model.rotation.y = alliance === 'red' ? 0 : Math.PI;

    result.set(id, model);
  }

  return result;
}

/**
 * Build the two-dot cargo indicator. Lives at a fixed local position
 * above the bot. Children index 0/1 are the two dots; the indicator
 * group has helper data attached for updateCargoIndicator() to use.
 */
function buildCargoIndicator() {
  const cfg = CARGO_INDICATORS;
  const group = new THREE.Group();
  group.name = 'cargo-indicator';
  group.position.y = cfg.yOffset;

  // The bot can be rotated by the auton (yaw); we want the dots to stay
  // upright relative to world space. Since rotation.y on the parent affects
  // children too, we accept that the dots rotate with the bot. They're
  // symmetrically placed so that's visually fine.

  for (let i = 0; i < 2; i++) {
    const dotGroup = new THREE.Group();
    dotGroup.position.x = (i - 0.5) * cfg.spacing;

    // Filled state
    const filledGeo = new THREE.SphereGeometry(cfg.dotRadius, 12, 12);
    const filledMat = new THREE.MeshStandardMaterial({
      color: cfg.filledColor,
      emissive: cfg.filledColor,
      emissiveIntensity: cfg.filledEmissive,
      metalness: 0.2,
      roughness: 0.5,
    });
    const filled = new THREE.Mesh(filledGeo, filledMat);
    filled.userData.role = 'filled';
    dotGroup.add(filled);

    // Empty state (smaller, semi-transparent)
    const emptyGeo = new THREE.SphereGeometry(cfg.dotRadius * 0.6, 12, 12);
    const emptyMat = new THREE.MeshStandardMaterial({
      color: cfg.emptyColor,
      transparent: true,
      opacity: cfg.emptyOpacity,
      metalness: 0.0,
      roughness: 0.9,
    });
    const empty = new THREE.Mesh(emptyGeo, emptyMat);
    empty.userData.role = 'empty';
    empty.visible = false;  // toggled in update
    dotGroup.add(empty);

    // Outline ring (only shown when slot is "available but empty")
    if (cfg.emptyOutline) {
      const ringGeo = new THREE.TorusGeometry(cfg.dotRadius * 0.85, 0.025, 8, 24);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xfff7e4,
        transparent: true,
        opacity: 0.4,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = Math.PI / 2;
      ring.userData.role = 'ring';
      ring.visible = false;
      dotGroup.add(ring);
    }

    group.add(dotGroup);
  }

  return group;
}

/**
 * Update the visual state of a bot's cargo indicator.
 *   held = number of cargo currently held (0..2)
 *   max  = capacity (1 or 2)
 */
export function updateCargoIndicator(botMesh, held, max) {
  const indicator = botMesh.userData.cargoIndicator;
  if (!indicator) return;

  for (let i = 0; i < 2; i++) {
    const dotGroup = indicator.children[i];
    if (!dotGroup) continue;
    const filled = dotGroup.children.find(c => c.userData.role === 'filled');
    const empty  = dotGroup.children.find(c => c.userData.role === 'empty');
    const ring   = dotGroup.children.find(c => c.userData.role === 'ring');

    if (i < held) {
      // Slot is filled
      if (filled) filled.visible = true;
      if (empty)  empty.visible = false;
      if (ring)   ring.visible = false;
    } else if (i < max) {
      // Slot is empty but available
      if (filled) filled.visible = false;
      if (empty)  empty.visible = true;
      if (ring)   ring.visible = true;
    } else {
      // Slot is beyond capacity → hide entirely
      if (filled) filled.visible = false;
      if (empty)  empty.visible = false;
      if (ring)   ring.visible = false;
    }
  }
}
