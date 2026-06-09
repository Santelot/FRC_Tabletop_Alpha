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
import { CHALLENGE_CARDS } from '../challenges.js';
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

  // Classify hexes per active challenge. Shooter challenges highlight the
  // hub; placement challenges highlight the charge station and tint the
  // alliance zones from the card (no leftover hub highlight at center).
  const card = CHALLENGE_CARDS[ACTIVE_CHALLENGE];
  const isShooter = !card || card.scoringModel === 'shooter';
  const keyOf = ([c, r]) => hexKey({ col: c, row: r });
  let highlightKeys = HUB_KEYS, redZoneKeys = null, blueZoneKeys = null;
  if (!isShooter) {
    highlightKeys = new Set();
    for (const side of ['red', 'blue']) {
      const cs = card.chargeStation?.[side];
      if (cs) [...cs.edges, ...cs.center].forEach(co => highlightKeys.add(keyOf(co)));
    }
    redZoneKeys  = new Set((card.allianceZone?.red  || []).map(keyOf));
    blueZoneKeys = new Set((card.allianceZone?.blue || []).map(keyOf));
  }

  const hexes = allHexes();

  hexes.forEach(h => {
    const { x, z } = hexCenter(h.col, h.row);
    const k = hexKey(h);
    const isHighlight = highlightKeys.has(k);
    const rc = ROW_COUNTS[h.row];
    const isRedZone  = isShooter ? (h.col <= 1)      : redZoneKeys.has(k);
    const isBlueZone = isShooter ? (h.col >= rc - 2) : blueZoneKeys.has(k);

    // Pick zone style
    let zoneStyle;
    if (isHighlight)      zoneStyle = style.zones.hub;
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

    // ---- Hub hex translucent fill (shooter challenges only) ----
    if (isShooter && isHighlight && style.hubHexFill.enabled) {
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
// ============================================================
//  CHARGED UP — field elements as primitive stand-ins (Step 2)
// ============================================================
//  Driven entirely from the challenge card coordinates. Real GLB
//  models drop in at Step 5; these primitives keep the same anchors.

function hexTile(col, row, { radius = HEX_SIZE * 0.9, height = 0.1, color = 0xffffff, y = 0, emissive = 0, opacity = 1 } = {}) {
  const geo = new THREE.CylinderGeometry(radius, radius, height, 6);
  const mat = new THREE.MeshStandardMaterial({
    color, metalness: 0.2, roughness: 0.6,
    emissive, emissiveIntensity: emissive ? 0.25 : 0,
    transparent: opacity < 1, opacity,
  });
  const m = new THREE.Mesh(geo, mat);
  const { x, z } = hexCenter(col, row);
  m.position.set(x, y + height / 2, z);
  m.rotation.y = Math.PI / 6;        // pointy-top alignment
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

// Load a model by key and drop it at a hex anchor (optional Y rotation).
async function placeModelAtHex(key, col, row, rotY = 0) {
  const model = await loadModel(key);
  const { x, z } = hexCenter(col, row);
  model.position.set(x, 0, z);
  model.rotation.y = rotY;
  return model;
}

/**
 * Build the Charged Up field: alliance-zone tint + feeders as primitives,
 * plus the real grid and charge-station MODELS (per the challenge card).
 * Anchor hexes are a first guess — fine-tune each model's offset/scale via
 * MODEL_TRANSFORMS in config.js.
 */
export async function buildChargedUpElements(card) {
  const group = new THREE.Group();
  group.name = 'chargedup-elements';

  // Where each structure model is dropped (anchor hex per side):
  const gridAnchor   = { red: [0, 2], blue: [14, 2] };
  const chargeAnchor = { red: [4, 3], blue: [11, 3] };  // charge-station center hex

  for (const side of ['red', 'blue']) {
    const allianceColor = side === 'red' ? 0xc72a35 : 0x1e88e5;
    const facing = side === 'red' ? 0 : Math.PI;

    // Alliance-zone tint + feeders stay primitives (no dedicated models).
    (card.allianceZone?.[side] || []).forEach(([c, r]) =>
      group.add(hexTile(c, r, { color: allianceColor, height: 0.04, opacity: 0.10, radius: HEX_SIZE * 0.95 })));
    (card.feeders?.[side] || []).forEach(([c, r]) =>
      group.add(hexTile(c, r, { color: 0x8e5bd9, height: 0.08, emissive: 0x8e5bd9, opacity: 0.7 })));

    // Grid model — separate red/blue GLBs, already mirrored per side (no extra rotation).
    const gridKey = card.models?.grid?.[side];
    if (gridKey) {
      const [gc, gr] = gridAnchor[side];
      group.add(await placeModelAtHex(gridKey, gc, gr, 0));
    }

    // Charge-station model — per-alliance key (same GLB), independently tunable; blue mirrored 180°.
    const csKey = card.models?.chargeStation?.[side];
    if (csKey) {
      const [cc, cr] = chargeAnchor[side];
      group.add(await placeModelAtHex(csKey, cc, cr, facing));
    }
  }

  return group;
}

/**
 * Loads the scoring structures for the active challenge:
 *   shooter   → the hub model (Rapid React)
 *   placement → the Charged Up grid + charge-station models
 */
export async function loadChallengeStructures() {
  const card = CHALLENGE_CARDS[ACTIVE_CHALLENGE];
  const group = new THREE.Group();
  group.name = 'structures';
  if (!card || card.scoringModel === 'shooter') {
    group.add(await loadHubModel());
  } else {
    group.add(await buildChargedUpElements(card));
  }
  return group;
}
