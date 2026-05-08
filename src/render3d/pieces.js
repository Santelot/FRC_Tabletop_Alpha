// ============================================================
//  CARGO PIECES — load cargo model, clone instances at piece positions
// ============================================================

import * as THREE from 'three';
import { loadModel } from './loader.js';
import { hexCenter, computePiecePositions } from '../sim/hex.js';
import { ACTIVE_CHALLENGE, CHALLENGES } from '../config.js';

/**
 * Returns:
 *   { pieces: [{ id, pos, mesh }, ...], group: Three.Group }
 *
 * The group is what you add to the scene; pieces[i].mesh is the
 * Object3D for piece i (so the simulation can hide/move/remove it).
 */
export async function loadPieces() {
  const positions = computePiecePositions();
  const group = new THREE.Group();
  group.name = 'pieces';

  // Load the cargo model for the active challenge.
  const cargoKey = CHALLENGES[ACTIVE_CHALLENGE].cargo;
  const template = await loadModel(cargoKey);

  const pieces = positions.map(p => {
    const mesh = template.clone(true);
    mesh.name = `piece-${p.id}`;
    const { x, z } = hexCenter(p.pos.col, p.pos.row);
    mesh.position.set(x, 0, z);
    group.add(mesh);
    return { ...p, mesh };
  });

  return { pieces, group };
}
