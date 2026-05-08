// ============================================================
//  HEX MATH
// ============================================================
//  Pointy-top hex grid, 9 rows alternating 15/16/15/...
//  Coordinate convention:
//    col, row are integer hex coords
//    Returns world position {x, z} (y is always 0 — ground plane)
//
//  Ported from v0.2 SVG version. All "world units" — the simulation
//  doesn't care about pixels, only hex coords and world positions.
// ============================================================

import { HEX_SIZE } from '../config.js';

export const ROW_COUNTS = [15, 16, 15, 16, 15, 16, 15, 16, 15];
export const ROWS = ROW_COUNTS.length;

// Pointy-top hex geometry
export const HEX_W = Math.sqrt(3) * HEX_SIZE;          // flat-to-flat width
export const HEX_VSTEP = 1.5 * HEX_SIZE;                // vertical step between row centers (along Z)
export const FIELD_W = Math.max(...ROW_COUNTS) * HEX_W; // total width along X
export const FIELD_D = (ROWS - 1) * HEX_VSTEP + 2 * HEX_SIZE; // total depth along Z

// Center the field so that hex (col=middle, row=middle) is roughly at origin
const FIELD_X_OFFSET = -FIELD_W / 2 + HEX_W / 2;
const FIELD_Z_OFFSET = -FIELD_D / 2 + HEX_SIZE;

/**
 * World-space center of hex (col, row). Returns {x, z}; y is always 0.
 *
 * 16-hex rows extend half a hex out on each side; 15-hex rows are inset.
 */
export function hexCenter(col, row) {
  const isLong = ROW_COUNTS[row] === 16;
  // For 15-rows, shift right by half a hex so they nest between the long rows.
  const xInRow = isLong ? col : col + 0.5;
  const x = FIELD_X_OFFSET + xInRow * HEX_W;
  const z = FIELD_Z_OFFSET + row * HEX_VSTEP;
  return { x, z };
}

/**
 * Returns hex centers for all valid (col, row) positions.
 * Used to draw the visible hex grid.
 */
export function allHexes() {
  const out = [];
  for (let row = 0; row < ROWS; row++) {
    const rc = ROW_COUNTS[row];
    for (let col = 0; col < rc; col++) {
      out.push({ col, row });
    }
  }
  return out;
}

export const hexKey = h => `${h.col},${h.row}`;

/**
 * Returns the (up to 6) neighbors of a hex.
 * Handles the irregular 15/16 row offsetting.
 */
export function getNeighbors({ col, row }) {
  const res = [];
  const isLong = ROW_COUNTS[row] === 16;
  const rc = ROW_COUNTS[row];
  // Same-row left/right
  if (col > 0)       res.push({ col: col - 1, row });
  if (col < rc - 1)  res.push({ col: col + 1, row });
  // Above
  if (row > 0) {
    const above = ROW_COUNTS[row - 1];
    if (isLong) {
      if (col - 1 >= 0)        res.push({ col: col - 1, row: row - 1 });
      if (col < above)         res.push({ col, row: row - 1 });
    } else {
      res.push({ col, row: row - 1 });
      if (col + 1 < above)     res.push({ col: col + 1, row: row - 1 });
    }
  }
  // Below
  if (row < ROWS - 1) {
    const below = ROW_COUNTS[row + 1];
    if (isLong) {
      if (col - 1 >= 0)        res.push({ col: col - 1, row: row + 1 });
      if (col < below)         res.push({ col, row: row + 1 });
    } else {
      res.push({ col, row: row + 1 });
      if (col + 1 < below)     res.push({ col: col + 1, row: row + 1 });
    }
  }
  return res;
}

/**
 * Hex-grid distance between two hexes (number of steps along the grid).
 */
function offsetToAxial({ col, row }) {
  const isLong = ROW_COUNTS[row] === 16;
  const q = isLong ? (col - row / 2) : (col + 0.5 - row / 2);
  return { q, r: row };
}

export function hexDist(a, b) {
  const aa = offsetToAxial(a);
  const bb = offsetToAxial(b);
  const dq = aa.q - bb.q;
  const dr = aa.r - bb.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

// ============================================================
//  KEY POSITIONS
// ============================================================

export const HUB_CENTER = { col: 7, row: 4 };
export const HUB_HEXES = [
  HUB_CENTER,
  { col: 6, row: 4 }, { col: 8, row: 4 },
  { col: 7, row: 3 }, { col: 8, row: 3 },
  { col: 7, row: 5 }, { col: 8, row: 5 },
];
export const HUB_KEYS = new Set(HUB_HEXES.map(hexKey));

export const START_POS = {
  R1: { col: 0,  row: 2 },
  R2: { col: 0,  row: 4 },
  R3: { col: 0,  row: 6 },
  B1: { col: 14, row: 2 },
  B2: { col: 14, row: 4 },
  B3: { col: 14, row: 6 },
};

/**
 * Compute the deterministic cargo positions:
 *   - alternating pattern around hub ring 2
 *   - 3 in upper-right corner, 3 in lower-left corner
 */
export function computePiecePositions() {
  const out = [];
  // Ring 1 around hub
  const ring1Set = new Set();
  HUB_HEXES.forEach(h => {
    getNeighbors(h).forEach(n => {
      const k = hexKey(n);
      if (!HUB_KEYS.has(k)) ring1Set.add(k);
    });
  });
  const ring1 = [...ring1Set].map(k => {
    const [c, r] = k.split(',').map(Number);
    return { col: c, row: r };
  });

  // Ring 2 = adjacent to ring 1, not in hub or ring 1
  const ring1Keys = new Set(ring1.map(hexKey));
  const ring2Set = new Set();
  ring1.forEach(h => {
    getNeighbors(h).forEach(n => {
      const k = hexKey(n);
      if (!HUB_KEYS.has(k) && !ring1Keys.has(k)) ring2Set.add(k);
    });
  });
  const ring2 = [...ring2Set].map(k => {
    const [c, r] = k.split(',').map(Number);
    return { col: c, row: r };
  });

  // Sort ring 2 by angle around hub center for clean alternating pattern
  const center = hexCenter(HUB_CENTER.col, HUB_CENTER.row);
  ring2.sort((a, b) => {
    const aXY = hexCenter(a.col, a.row);
    const bXY = hexCenter(b.col, b.row);
    const aAng = Math.atan2(aXY.z - center.z, aXY.x - center.x);
    const bAng = Math.atan2(bXY.z - center.z, bXY.x - center.x);
    return aAng - bAng;
  });

  // Every-other piece on the ring
  ring2.forEach((h, i) => {
    if (i % 2 === 0) out.push(h);
  });

  // Corner clusters
  const corners = [
    { col: 13, row: 1 }, { col: 14, row: 1 }, { col: 13, row: 0 },  // upper-right
    { col: 1,  row: 7 }, { col: 0,  row: 7 }, { col: 2,  row: 8 },  // lower-left
  ];
  const blockedKeys = new Set([
    ...HUB_HEXES.map(hexKey),
    ...Object.values(START_POS).map(hexKey),
    ...out.map(hexKey),
  ]);
  corners.forEach(h => {
    if (h.row < 0 || h.row >= ROWS) return;
    if (h.col < 0 || h.col >= ROW_COUNTS[h.row]) return;
    const k = hexKey(h);
    if (blockedKeys.has(k)) return;
    out.push(h);
    blockedKeys.add(k);
  });

  return out.map((pos, i) => ({ id: `P${i}`, pos, taken: false }));
}
