// ============================================================
//  FIELD — hex grid visualization + field/hub model loading
// ============================================================

import * as THREE from 'three';
import { loadModel } from './loader.js';
import { HEX_SIZE } from '../config.js';
import {
  allHexes, hexCenter, HUB_HEXES, HUB_KEYS, hexKey, ROW_COUNTS,
} from '../sim/hex.js';

/**
 * Procedurally generate the hex grid as line outlines on the ground plane.
 * (We keep this even when loading a field model, so coordinate alignment is
 *  visible during development. Set visible=false to hide once tuned.)
 */
export function buildHexGrid({ visible = true } = {}) {
  const group = new THREE.Group();
  group.name = 'hex-grid';
  group.visible = visible;

  const hexes = allHexes();

  // Pre-compute pointy-top hex outline (in local space)
  const localPts = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i + Math.PI / 6;
    localPts.push(new THREE.Vector3(
      Math.cos(a) * HEX_SIZE * 0.5,
      0,
      Math.sin(a) * HEX_SIZE * 0.5,
    ));
  }
  localPts.push(localPts[0].clone());  // close the loop

  hexes.forEach(h => {
    const { x, z } = hexCenter(h.col, h.row);
    const k = hexKey(h);
    const isHub = HUB_KEYS.has(k);
    const rc = ROW_COUNTS[h.row];
    const isRedZone = h.col <= 1;
    const isBlueZone = h.col >= rc - 2;

    // Color by zone
    let color = 0x666666;
    let opacity = 0.25;
    if (isHub) { color = 0xffb627; opacity = 0.7; }
    else if (isRedZone) { color = 0xe63946; opacity = 0.45; }
    else if (isBlueZone) { color = 0x1e88e5; opacity = 0.45; }

    const geo = new THREE.BufferGeometry().setFromPoints(localPts);
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity });
    const line = new THREE.LineLoop(geo, mat);
    line.position.set(x, 0.005, z);  // tiny lift to avoid z-fighting with ground
    group.add(line);

    // Hub hex fill — a translucent gold disc on each of the 7 hub hexes
    if (isHub) {
      const fillGeo = new THREE.CircleGeometry(HEX_SIZE * 0.46, 6);
      const fillMat = new THREE.MeshBasicMaterial({
        color: 0xffb627, transparent: true, opacity: 0.18, side: THREE.DoubleSide,
      });
      const fill = new THREE.Mesh(fillGeo, fillMat);
      fill.rotation.x = -Math.PI / 2;
      fill.rotation.z = Math.PI / 2;  // align flat-side to +X
      fill.position.set(x, 0.01, z);
      group.add(fill);
    }
  });

  return group;
}

/**
 * Loads the field model (.glb) at the field origin.
 * If the file is missing, the placeholder (a flat carpet rectangle) is used.
 */
export async function loadFieldModel() {
  const model = await loadModel('field');
  model.name = 'field-model';
  return model;
}

/**
 * Loads the hub model (.glb) at the center of the hub hex cluster.
 */
export async function loadHubModel() {
  const model = await loadModel('hub');
  model.name = 'hub-model';
  const center = hexCenter(7, 4);  // HUB_CENTER
  model.position.set(center.x, 0, center.z);
  return model;
}
