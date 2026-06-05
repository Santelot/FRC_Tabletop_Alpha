// ============================================================
//  FIELD — hex grid visualization + field/hub model loading
// ============================================================
//  Hex grid uses Line2 (screen-space thick lines) so strokeWidth
//  works reliably across platforms. Style is driven by HEX_FIELD_STYLE
//  in style.js — tweak there for thickness, color, glow, hex size, etc.
//
//  Note: hex VISUAL size (hexRadiusMul) is independent of grid spacing
//  (HEX_SIZE in config.js). Change hexRadiusMul to grow/shrink the
//  outlines without affecting where bots and pieces are placed.
// ============================================================

import * as THREE from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';

import { loadModel } from './loader.js';
import { HEX_SIZE, ACTIVE_CHALLENGE, CHALLENGES } from '../config.js';
import { HEX_FIELD_STYLE } from '../style.js';
import {
  allHexes, hexCenter, HUB_HEXES, HUB_KEYS, hexKey, ROW_COUNTS,
} from '../sim/hex.js';

// We collect all LineMaterial instances so they can be resolution-updated
// when the canvas resizes (Line2 needs to know the screen size).
const lineMaterials = [];

export function getFieldLineMaterials() {
  return lineMaterials;
}

/**
 * Procedurally generate the hex grid as Line2 thick outlines on the
 * ground plane. Style driven by HEX_FIELD_STYLE in style.js.
 */
export function buildHexGrid({ visible = true } = {}) {
  const group = new THREE.Group();
  group.name = 'hex-grid';
  group.visible = visible;

  const style = HEX_FIELD_STYLE;
  // Outline radius — independent of HEX_SIZE (grid spacing).
  const radius = HEX_SIZE * (style.hexRadiusMul ?? 0.5);

  // Pre-compute pointy-top hex outline as a flat array (Line2 wants flat positions)
  const localPosArray = [];
  for (let i = 0; i <= 6; i++) {
    const a = (Math.PI / 3) * (i % 6) + Math.PI / 6;
    localPosArray.push(
      Math.cos(a) * radius,
      0,
      Math.sin(a) * radius,
    );
  }

  const hexes = allHexes();

  hexes.forEach(h => {
    const { x, z } = hexCenter(h.col, h.row);
    const k = hexKey(h);
    const isHub = HUB_KEYS.has(k);
    const rc = ROW_COUNTS[h.row];
    const isRedZone = h.col <= 1;
    const isBlueZone = h.col >= rc - 2;

    // Pick zone style
    let zoneStyle;
    if (isHub)            zoneStyle = style.zones.hub;
    else if (isRedZone)   zoneStyle = style.zones.redZone;
    else if (isBlueZone)  zoneStyle = style.zones.blueZone;
    else                  zoneStyle = style.zones.neutral;

    // ---- Underglow line (drawn first, below) ----
    if (style.glow.enabled) {
      const glowGeo = new LineGeometry();
      glowGeo.setPositions(localPosArray);
      const glowMat = new LineMaterial({
        color:       zoneStyle.color,
        linewidth:   style.glow.width,
        transparent: true,
        opacity:     style.glow.opacity,
        depthTest:   true,
        depthWrite:  false,
      });
      glowMat.resolution.set(window.innerWidth, window.innerHeight);
      const glowLine = new Line2(glowGeo, glowMat);
      glowLine.position.set(x, style.yLift + style.glow.yOffset, z);
      glowLine.computeLineDistances();
      group.add(glowLine);
      lineMaterials.push(glowMat);
    }

    // ---- Main stroke ----
    const geo = new LineGeometry();
    geo.setPositions(localPosArray);
    const mat = new LineMaterial({
      color:       zoneStyle.color,
      linewidth:   style.strokeWidth,
      transparent: true,
      opacity:     zoneStyle.opacity,
      depthTest:   true,
      depthWrite:  false,
    });
    mat.resolution.set(window.innerWidth, window.innerHeight);
    const line = new Line2(geo, mat);
    line.position.set(x, style.yLift, z);
    line.computeLineDistances();
    group.add(line);
    lineMaterials.push(mat);

    // ---- Hub hex translucent fill ----
    if (isHub && style.hubHexFill.enabled) {
      const fillGeo = new THREE.CircleGeometry(HEX_SIZE * style.hubHexFill.radiusMul, 6);
      const fillMat = new THREE.MeshBasicMaterial({
        color:       style.hubHexFill.color,
        transparent: true,
        opacity:     style.hubHexFill.opacity,
        side:        THREE.DoubleSide,
      });
      const fill = new THREE.Mesh(fillGeo, fillMat);
      fill.rotation.x = -Math.PI / 2;
      fill.rotation.z = Math.PI / 2;
      fill.position.set(x, style.yLift + 0.005, z);
      group.add(fill);
    }
  });

  return group;
}

/**
 * Loads the field model for the active challenge.
 * If the file is missing, the placeholder (a flat carpet rectangle) is used.
 */
export async function loadFieldModel() {
  const fieldKey = CHALLENGES[ACTIVE_CHALLENGE].field;
  const model = await loadModel(fieldKey);
  model.name = 'field-model';
  return model;
}

/**
 * Loads the hub model for the active challenge, at the center of the
 * hub hex cluster.
 */
export async function loadHubModel() {
  const hubKey = CHALLENGES[ACTIVE_CHALLENGE].hub;
  const model = await loadModel(hubKey);
  model.name = 'hub-model';
  const center = hexCenter(7, 4);  // HUB_CENTER
  model.position.set(center.x, 0, center.z);
  return model;
}