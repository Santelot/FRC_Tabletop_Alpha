// ============================================================
//  EFFECTS — particles, popups, hub pulse, auras, disruptor, rotation
// ============================================================

import * as THREE from 'three';
import { hexCenter, HUB_CENTER } from '../sim/hex.js';
import { HEX_SIZE } from '../config.js';
import { TIMING, CHARGE_DOCK } from '../style.js';

// ============================================================
//  Tween utility
// ============================================================

const easeOutCubic = t => 1 - Math.pow(1 - t, 3);
const easeInCubic = t => t * t * t;
const easeInOutQuad = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

function tween(durationMs, onUpdate, easing = easeOutCubic) {
  return new Promise(resolve => {
    const start = performance.now();
    function step(now) {
      const t = Math.min((now - start) / durationMs, 1);
      onUpdate(easing(t), t);
      if (t < 1) requestAnimationFrame(step);
      else resolve();
    }
    requestAnimationFrame(step);
  });
}

export const sleep = ms => new Promise(r => setTimeout(r, ms));

// ============================================================
//  ROTATION — turn a bot to face a world target
// ============================================================
//  Bot models face +X by default. Their rotation.y = 0 means facing +X.
//  rotation.y = π means facing -X.
//
//  This animation uses shortest-path angular interpolation so a bot
//  doesn't take the long way around (e.g. 350° instead of -10°).

/**
 * Rotate a bot to face the given world XZ position.
 * Uses shortest-path angular interpolation, with duration scaled by
 * the size of the turn.
 */
export async function turnBotTo(botMesh, targetXZ) {
  const dx = targetXZ.x - botMesh.position.x;
  const dz = targetXZ.z - botMesh.position.z;
  // atan2(z,x): angle in XZ plane. But the bot's rotation.y around +Y is
  // measured counter-clockwise from +X axis. Three.js uses right-handed,
  // so rotation.y positive turns from +X toward -Z. Our XZ plane has +Z
  // going "backward". We want the bot to face the dx/dz direction.
  // The angle that puts +X axis pointing toward (dx,dz) is atan2(-dz, dx).
  const targetAngle = Math.atan2(-dz, dx);

  const fromAngle = botMesh.rotation.y;
  // Shortest delta in (-π, π]
  let delta = targetAngle - fromAngle;
  while (delta > Math.PI)  delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;

  // Skip if already facing close enough
  if (Math.abs(delta) < 0.05) {
    botMesh.rotation.y = targetAngle;
    return;
  }

  const duration = TIMING.rotationBaseMs + Math.abs(delta) * TIMING.rotationPerRadian;

  await tween(duration, eased => {
    botMesh.rotation.y = fromAngle + delta * eased;
  });
  botMesh.rotation.y = targetAngle;
}

// ============================================================
//  Hub pulse — pulses the hub's emissive intensity on a hit
// ============================================================

export function pulseHub(hubGlowLight) {
  if (!hubGlowLight) return;
  const baseIntensity = hubGlowLight.userData.baseIntensity ?? hubGlowLight.intensity;
  hubGlowLight.userData.baseIntensity = baseIntensity;

  tween(700, (eased, t) => {
    const spike = t < 0.2 ? t / 0.2 : (1 - t) / 0.8;
    hubGlowLight.intensity = baseIntensity + spike * 4.0;
  }, x => x);
}

// ============================================================
//  Dust puffs
// ============================================================

export function spawnDust(parentGroup, worldPos) {
  for (let i = 0; i < 4; i++) {
    const geo = new THREE.SphereGeometry(0.08 + Math.random() * 0.08, 6, 6);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xfff7e4,
      transparent: true,
      opacity: 0.7,
    });
    const m = new THREE.Mesh(geo, mat);
    const offX = (Math.random() - 0.5) * 0.6;
    const offZ = (Math.random() - 0.5) * 0.6;
    m.position.set(worldPos.x + offX, 0.15, worldPos.z + offZ);
    parentGroup.add(m);

    tween(600, (eased, t) => {
      m.position.y = 0.15 + eased * 0.5;
      const s = 1 + eased * 1.5;
      m.scale.setScalar(s);
      mat.opacity = 0.7 * (1 - eased);
    }).then(() => {
      parentGroup.remove(m);
      geo.dispose();
      mat.dispose();
    });
  }
}

// ============================================================
//  Confetti
// ============================================================

export function confettiBurst(parentGroup, worldPos, alliance) {
  const colors = alliance === 'red'
    ? [0xffb627, 0xe63946, 0xffe9a8]
    : [0xffb627, 0x1e88e5, 0xffe9a8];

  for (let i = 0; i < 24; i++) {
    const geo = new THREE.PlaneGeometry(0.18, 0.32);
    const mat = new THREE.MeshBasicMaterial({
      color: colors[i % colors.length],
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 1.0,
    });
    const m = new THREE.Mesh(geo, mat);
    m.position.set(worldPos.x, worldPos.y + 1.5, worldPos.z);
    m.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    parentGroup.add(m);

    const angle = Math.random() * Math.PI * 2;
    const speed = 2 + Math.random() * 3;
    const vx = Math.cos(angle) * speed;
    const vz = Math.sin(angle) * speed;
    const vy = 1 + Math.random() * 2;
    const spinX = (Math.random() - 0.5) * 12;
    const spinY = (Math.random() - 0.5) * 12;

    const startY = m.position.y;
    const startX = m.position.x;
    const startZ = m.position.z;

    tween(1200, (eased, t) => {
      m.position.x = startX + vx * t * 0.6;
      m.position.z = startZ + vz * t * 0.6;
      m.position.y = startY + vy * t - 4 * t * t;
      m.rotation.x += spinX * 0.016;
      m.rotation.y += spinY * 0.016;
      mat.opacity = t < 0.7 ? 1 : (1 - t) / 0.3;
    }, x => x).then(() => {
      parentGroup.remove(m);
      geo.dispose();
      mat.dispose();
    });
  }
}

// ============================================================
//  Defensive aura
// ============================================================

export function spawnDefensiveAura(parentGroup, worldPos, blocks) {
  const radius = HEX_SIZE * (1.0 + blocks * 0.5);
  const geo = new THREE.RingGeometry(radius * 0.85, radius, 48);
  const mat = new THREE.MeshBasicMaterial({
    color: 0x8e5bd9,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
  });
  const m = new THREE.Mesh(geo, mat);
  m.rotation.x = -Math.PI / 2;
  m.position.set(worldPos.x, 0.04, worldPos.z);
  m.scale.setScalar(0.3);
  parentGroup.add(m);

  tween(600, eased => {
    m.scale.setScalar(0.3 + eased * 0.7);
    mat.opacity = eased * 0.55;
  });
  return m;
}

/**
 * Block pins — drops a pin token onto each blocked hex (Defensive Set).
 * `positions` is an array of world-space {x,z}; pins are alliance-coloured and
 * pop in with a short stagger so the blockade reads as it's placed.
 */
export function spawnBlockPins(parentGroup, positions, alliance) {
  if (!positions || !positions.length) return;
  const color = alliance === 'red' ? 0xe63946 : 0x1e88e5;

  positions.forEach((p, i) => {
    const group = new THREE.Group();
    group.position.set(p.x, 0, p.z);

    // hex-shaped ground marker for the blocked cell
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(HEX_SIZE * 0.5, HEX_SIZE * 0.62, 6),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.rotation.z = Math.PI / 6;
    ring.position.y = 0.05;
    group.add(ring);

    // the pin: tapered post + pale cap
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(HEX_SIZE * 0.10, HEX_SIZE * 0.16, HEX_SIZE * 0.9, 12),
      new THREE.MeshStandardMaterial({ color, metalness: 0.35, roughness: 0.5, emissive: color, emissiveIntensity: 0.25 })
    );
    post.position.y = HEX_SIZE * 0.45;
    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(HEX_SIZE * 0.22, 14, 14),
      new THREE.MeshStandardMaterial({ color: 0xfff7e4, metalness: 0.2, roughness: 0.4, emissive: color, emissiveIntensity: 0.3 })
    );
    cap.position.y = HEX_SIZE * 0.95;
    group.add(post, cap);

    group.scale.setScalar(0.001);
    parentGroup.add(group);

    setTimeout(() => {
      tween(420, eased => {
        group.scale.setScalar(0.001 + eased);
        group.position.y = (1 - eased) * HEX_SIZE * 0.8; // drops in from above
        ring.material.opacity = eased * 0.7;
      }).then(() => { group.position.y = 0; });
    }, i * 130);
  });
}

// ============================================================
//  Disruptor streak
// ============================================================

export function fireDisruptorStreak(parentGroup, fromXZ, toXZ) {
  const fromV = new THREE.Vector3(fromXZ.x, 1.0, fromXZ.z);
  const toV = new THREE.Vector3(toXZ.x, 1.0, toXZ.z);
  const geo = new THREE.BufferGeometry().setFromPoints([fromV, toV]);
  const mat = new THREE.LineBasicMaterial({
    color: 0x8e5bd9,
    transparent: true,
    opacity: 1.0,
    linewidth: 4,
  });
  const line = new THREE.Line(geo, mat);
  parentGroup.add(line);

  tween(1700, (eased, t) => {
    if (t < 0.18)      mat.opacity = (t / 0.18) * 1.0;
    else if (t < 0.6)  mat.opacity = 1.0;
    else               mat.opacity = (1 - t) / 0.4;
  }, x => x).then(() => {
    parentGroup.remove(line);
    geo.dispose();
    mat.dispose();
  });
}

export function attachDisruptedRing(botGroup) {
  const geo = new THREE.RingGeometry(HEX_SIZE * 0.55, HEX_SIZE * 0.7, 32);
  const mat = new THREE.MeshBasicMaterial({
    color: 0x8e5bd9,
    transparent: true,
    opacity: 0.75,
    side: THREE.DoubleSide,
  });
  const ring = new THREE.Mesh(geo, mat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.08;
  ring.userData.isDisruptedRing = true;
  botGroup.add(ring);

  let lastSpinTime = performance.now();
  function spin() {
    if (!ring.parent) return;
    const now = performance.now();
    const dt = (now - lastSpinTime) / 1000;
    lastSpinTime = now;
    ring.rotation.z += dt * 1.4;
    requestAnimationFrame(spin);
  }
  requestAnimationFrame(spin);

  return ring;
}

// ============================================================
//  Shot animations
// ============================================================

export async function showAimCrosshair(parentGroup) {
  const hubXZ = hexCenter(HUB_CENTER.col, HUB_CENTER.row);
  const geo = new THREE.RingGeometry(HEX_SIZE * 0.45, HEX_SIZE * 0.55, 32);
  const mat = new THREE.MeshBasicMaterial({
    color: 0xffb627,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
  });
  const ring = new THREE.Mesh(geo, mat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(hubXZ.x, 1.2, hubXZ.z);
  parentGroup.add(ring);

  await tween(550, (eased, t) => {
    if (t < 0.6) {
      mat.opacity = t / 0.6;
      ring.scale.setScalar(2 - (t / 0.6) * 1.0);
    } else {
      mat.opacity = 1 - (t - 0.6) / 0.4;
      ring.scale.setScalar(1 - ((t - 0.6) / 0.4) * 0.15);
    }
  }, x => x);

  parentGroup.remove(ring);
  geo.dispose();
  mat.dispose();
}

export async function animateShotBall(parentGroup, fromXZ, hit) {
  const hubXZ = hexCenter(HUB_CENTER.col, HUB_CENTER.row);
  const HUB_TOP_Y = 9;
  const ballGeo = new THREE.SphereGeometry(0.45, 16, 16);
  const ballMat = new THREE.MeshStandardMaterial({
    color: 0xd1ff1a,
    emissive: 0xd1ff1a,
    emissiveIntensity: 0.4,
    metalness: 0.1,
    roughness: 0.4,
  });
  const ball = new THREE.Mesh(ballGeo, ballMat);
  ball.position.set(fromXZ.x, 1.0, fromXZ.z);
  parentGroup.add(ball);

  const targetXZ = hit
    ? { x: hubXZ.x, z: hubXZ.z }
    : {
        x: hubXZ.x + (Math.random() < 0.5 ? -1 : 1) * HEX_SIZE * 0.9,
        z: hubXZ.z + (Math.random() - 0.5) * HEX_SIZE * 0.6,
      };
  const targetY = hit ? HUB_TOP_Y : HUB_TOP_Y + 0.2;

  await tween(720, (eased, t) => {
    ball.position.x = fromXZ.x + (targetXZ.x - fromXZ.x) * eased;
    ball.position.z = fromXZ.z + (targetXZ.z - fromXZ.z) * eased;
    const peak = 2.5;
    ball.position.y = 1.0 + (targetY - 1.0) * eased + peak * Math.sin(Math.PI * eased);
  });

  if (hit) {
    await tween(220, eased => {
      ball.scale.setScalar(1 - eased);
      ball.position.set(hubXZ.x, HUB_TOP_Y - eased * 0.5, hubXZ.z);
    });
  } else {
    const deflectX = (Math.random() < 0.5 ? -1 : 1) * 1.5;
    const startX = ball.position.x;
    const startY = ball.position.y;
    const startZ = ball.position.z;
    await tween(420, (eased, t) => {
      ball.position.x = startX + deflectX * eased;
      ball.position.y = startY - eased * 1.5;
      ball.position.z = startZ;
      ballMat.opacity = 1 - eased;
      ballMat.transparent = true;
    });
  }

  parentGroup.remove(ball);
  ballGeo.dispose();
  ballMat.dispose();
}

// ============================================================
//  Score popups
// ============================================================

export function showScorePopup(canvasEl, camera, worldPos, text, alliance) {
  const v = new THREE.Vector3(worldPos.x, 1.5, worldPos.z);
  v.project(camera);
  const rect = canvasEl.getBoundingClientRect();
  const screenX = ((v.x + 1) / 2) * rect.width;
  const screenY = ((-v.y + 1) / 2) * rect.height;

  const div = document.createElement('div');
  div.className = 'score-popup';
  div.dataset.alliance = alliance;
  div.textContent = text;
  div.style.left = `${screenX}px`;
  div.style.top = `${screenY}px`;
  canvasEl.parentElement.appendChild(div);

  requestAnimationFrame(() => div.classList.add('is-firing'));
  setTimeout(() => div.remove(), 1200);
}

// ============================================================
//  Cargo pickup animation
// ============================================================

export async function animatePickup(pieceMesh, botGroup) {
  if (!pieceMesh) return;
  const startPos = pieceMesh.position.clone();
  const targetPos = botGroup.position.clone();
  targetPos.y = 1.4;

  await tween(380, (eased, t) => {
    pieceMesh.position.lerpVectors(startPos, targetPos, eased);
    pieceMesh.position.y += Math.sin(Math.PI * eased) * 0.8;
    pieceMesh.scale.setScalar(1 - eased * 0.6);
  });

  if (pieceMesh.parent) pieceMesh.parent.remove(pieceMesh);
}

// ============================================================
//  CHARGED UP — placement + charge-station animations
// ============================================================

/**
 * A scored cone/cube travels from the placing bot up into the grid rack and
 * settles. `piece` is an outer group from loadModel(). `toXZ` is the rack node
 * (already nudged by tier), `fromXZ` is the bot, `endY` the rack height.
 */
export async function spawnPlacedPiece(parentGroup, piece, toXZ, fromXZ, endY = 0) {
  if (!piece) return;
  parentGroup.add(piece);
  const from = fromXZ || { x: toXZ.x, z: toXZ.z };
  const startY = 1.1;
  await tween(440, eased => {
    piece.position.x = from.x + (toXZ.x - from.x) * eased;
    piece.position.z = from.z + (toXZ.z - from.z) * eased;
    // lift up out of the bot, arc over, drop into the rack at endY
    piece.position.y = startY + (endY - startY) * eased + Math.sin(Math.PI * eased) * 1.0;
  }, easeInOutQuad);
  piece.position.set(toXZ.x, endY, toXZ.z);
  await tween(150, eased => {
    const s = 1 - Math.sin(Math.PI * eased) * 0.12;   // settle squash (outer scale starts at 1)
    piece.scale.set(1 + (1 - s) * 0.5, s, 1 + (1 - s) * 0.5);
  });
  piece.scale.set(1, 1, 1);
}

/**
 * Glow ring under a docked bot — gold = ENGAGED (balanced), cyan = DOCKED.
 * Returns the ring so callers can keep it.
 */
export function spawnChargeDock(parentGroup, worldPos, engaged) {
  const color = engaged ? CHARGE_DOCK.engagedColor : CHARGE_DOCK.dockColor;
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(HEX_SIZE * 0.55, HEX_SIZE * 0.92, 44),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(worldPos.x, (worldPos.y || 0) + 0.06, worldPos.z);
  parentGroup.add(ring);
  tween(520, eased => {
    ring.material.opacity = eased * 0.9;
    ring.scale.setScalar(0.55 + eased * 0.45);
  });
  return ring;
}

/**
 * A charge bot climbs from its approach hex up onto the platform and settles.
 * raiseY is tuned in style.js (CHARGE_DOCK.raiseY) to match the GLB height.
 */
export async function animateDockRaise(botGroup, targetXZ, raiseY, climbMs, engaged) {
  if (!botGroup) return;
  const start = botGroup.position.clone();
  const endX = targetXZ.x, endZ = targetXZ.z;
  await tween(climbMs, eased => {
    botGroup.position.x = start.x + (endX - start.x) * eased;
    botGroup.position.z = start.z + (endZ - start.z) * eased;
    // climb the ramp: rise to raiseY with a little extra hop mid-way
    botGroup.position.y = start.y + (raiseY - start.y) * eased + Math.sin(Math.PI * eased) * 0.22;
  }, easeInOutQuad);
  botGroup.position.set(endX, raiseY, endZ);
  // settle bob
  await tween(220, eased => { botGroup.position.y = raiseY - Math.sin(Math.PI * eased) * 0.12; });
  botGroup.position.y = raiseY;
  if (engaged) {
    const baseZ = botGroup.rotation.z;
    await tween(320, eased => { botGroup.rotation.z = baseZ + Math.sin(Math.PI * 2 * eased) * 0.05; });
    botGroup.rotation.z = baseZ;
  }
}
