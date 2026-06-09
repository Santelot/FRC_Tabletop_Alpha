// ============================================================
//  PIECES — challenge-aware game pieces
// ============================================================
//  Rapid React: cargo model cloned around the hub ring.
//  Charged Up:  neutral cones + cubes at midfield (primitive
//               stand-ins until the GLBs land in Step 5).

import * as THREE from 'three';
import { loadModel } from './loader.js';
import { hexCenter, computePiecePositions } from '../sim/hex.js';
import { ACTIVE_CHALLENGE, CHALLENGES } from '../config.js';
import { CHALLENGE_CARDS } from '../challenges.js';

/**
 * Returns { pieces: [{ id, pos, mesh }, ...], group: THREE.Group }.
 * The group is added to the scene; pieces[i].mesh lets the sim move/hide it.
 */
export async function loadPieces() {
  const card = CHALLENGE_CARDS[ACTIVE_CHALLENGE];

  // ---- Charged Up (placement): neutral cones + cubes ----
  if (card && card.scoringModel !== 'shooter') {
    return await buildNeutralPieces(card);
  }

  // ---- Rapid React (shooter): cargo ring ----
  const positions = computePiecePositions();
  const group = new THREE.Group();
  group.name = 'pieces';

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

/** Charged Up neutral game pieces — cone + cube models cloned at their hexes. */
async function buildNeutralPieces(card) {
  const group = new THREE.Group();
  group.name = 'pieces';
  const np = card.neutralPieces || { cones: [], cubes: [] };

  const coneTpl = await loadModel(card.models.cone);
  const cubeTpl = await loadModel(card.models.cube);

  const pieces = [];
  (np.cones || []).forEach(([c, r], i) => {
    const mesh = coneTpl.clone(true);
    const { x, z } = hexCenter(c, r);
    mesh.position.set(x, 0, z);
    mesh.name = `cone-${i}`;
    group.add(mesh);
    pieces.push({ id: `cone-${i}`, kind: 'cone', pos: { col: c, row: r }, mesh });
  });
  (np.cubes || []).forEach(([c, r], i) => {
    const mesh = cubeTpl.clone(true);
    const { x, z } = hexCenter(c, r);
    mesh.position.set(x, 0, z);
    mesh.name = `cube-${i}`;
    group.add(mesh);
    pieces.push({ id: `cube-${i}`, kind: 'cube', pos: { col: c, row: r }, mesh });
  });

  return { pieces, group };
}
