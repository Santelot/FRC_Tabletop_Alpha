// ============================================================
//  EFFECTS — particles, popups, hub pulse, auras, disruptor streak
// ============================================================
//  All effects mount themselves into a parent group passed in. They
//  manage their own lifecycle (auto-remove when done).
//
//  Animations use raf-driven tweens — we don't own the render loop,
//  so each effect schedules frame updates via requestAnimationFrame.
// ============================================================

import * as THREE from 'three';
import { hexCenter, HUB_CENTER } from '../sim/hex.js';
import { HEX_SIZE } from '../config.js';

// ============================================================
//  Tween utility
// ============================================================

const easeOutCubic = t => 1 - Math.pow(1 - t, 3);
const easeInOutQuad = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

/**
 * Run an rAF tween. `onUpdate(eased, raw)` is called every frame.
 * Returns a Promise resolved when complete.
 */
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
//  Hub pulse — pulses the hub's emissive intensity on a hit
// ============================================================

export function pulseHub(hubGlowLight) {
  if (!hubGlowLight) return;
  const baseIntensity = hubGlowLight.userData.baseIntensity ?? hubGlowLight.intensity;
  hubGlowLight.userData.baseIntensity = baseIntensity;

  tween(700, (eased, t) => {
    // Quick spike then decay
    const spike = t < 0.2 ? t / 0.2 : (1 - t) / 0.8;
    hubGlowLight.intensity = baseIntensity + spike * 4.0;
  }, x => x);
}

// ============================================================
//  Dust puffs — small white particles at a bot's wheels on movement
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
//  Confetti — colorful spinning planes that fall after a score
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
      // Ballistic trajectory
      m.position.x = startX + vx * t * 0.6;
      m.position.z = startZ + vz * t * 0.6;
      m.position.y = startY + vy * t - 4 * t * t;  // gravity
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
//  Defensive aura — translucent disc on the ground around the bot
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
  // Stays on screen for the rest of the auton — caller can dispose later
  return m;
}

// ============================================================
//  Disruptor streak — line from disruptor to target with violet glow
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
    if (t < 0.18) {
      mat.opacity = (t / 0.18) * 1.0;
    } else if (t < 0.6) {
      mat.opacity = 1.0;
    } else {
      mat.opacity = (1 - t) / 0.4;
    }
  }, x => x).then(() => {
    parentGroup.remove(line);
    geo.dispose();
    mat.dispose();
  });
}

/**
 * Persistent violet ring around a disrupted bot. Returns the mesh so the
 * caller can dispose it when the auton ends.
 */
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

  // Spin it
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
//  Shot animations — aim crosshair and ball arc
// ============================================================

/**
 * Draw a brief crosshair on the hub (a yellow ring that pops in/out).
 */
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
      ring.scale.setScalar(2 - (t / 0.6) * 1.0);  // 2 → 1
    } else {
      mat.opacity = 1 - (t - 0.6) / 0.4;
      ring.scale.setScalar(1 - ((t - 0.6) / 0.4) * 0.15);
    }
  }, x => x);

  parentGroup.remove(ring);
  geo.dispose();
  mat.dispose();
}

/**
 * Animate a ball arcing from `from` to the hub. If `hit` is true, the
 * ball sinks into the hub. Otherwise it deflects off the rim.
 */
export async function animateShotBall(parentGroup, fromXZ, hit) {
  const hubXZ = hexCenter(HUB_CENTER.col, HUB_CENTER.row);
  const HUB_TOP_Y = 9;
  const ballGeo = new THREE.SphereGeometry(0.55, 16, 16);
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

  // Arc to target
  await tween(720, (eased, t) => {
    ball.position.x = fromXZ.x + (targetXZ.x - fromXZ.x) * eased;
    ball.position.z = fromXZ.z + (targetXZ.z - fromXZ.z) * eased;
    // Parabolic arc: peak above midpoint
    const peak = 2.5;
    ball.position.y = 1.0 + (targetY - 1.0) * eased + peak * Math.sin(Math.PI * eased);
  });

  if (hit) {
    // Sink into hub
    await tween(220, eased => {
      ball.scale.setScalar(1 - eased);
      ball.position.set(hubXZ.x, HUB_TOP_Y - eased * 0.5, hubXZ.z);
    });
  } else {
    // Deflect away
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
//  Score popups — DOM elements anchored to a 3D world position
// ============================================================
//  We position absolute-positioned divs over the canvas using projected
//  3D coords. Cheaper than CSS2DRenderer; avoids a second renderer.

export function showScorePopup(canvasEl, camera, worldPos, text, alliance) {
  // Project world → screen
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

  // Trigger animation, auto-remove
  requestAnimationFrame(() => div.classList.add('is-firing'));
  setTimeout(() => div.remove(), 1200);
}

// ============================================================
//  Cargo pickup animation — the piece flies to the bot
// ============================================================

export async function animatePickup(pieceMesh, botGroup) {
  if (!pieceMesh) return;
  const startPos = pieceMesh.position.clone();
  const targetPos = botGroup.position.clone();
  targetPos.y = 1.4;  // arrives at top of bot

  await tween(380, (eased, t) => {
    pieceMesh.position.lerpVectors(startPos, targetPos, eased);
    // Arc upward
    pieceMesh.position.y += Math.sin(Math.PI * eased) * 0.8;
    pieceMesh.scale.setScalar(1 - eased * 0.6);
  });

  // Remove from scene
  if (pieceMesh.parent) pieceMesh.parent.remove(pieceMesh);
}
