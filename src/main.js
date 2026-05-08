// ============================================================
//  ENTRY POINT — Phase 2
// ============================================================
//  Wires the setup screen, the match screen, the Three.js scene,
//  the model loading, and the auton orchestrator.
//
//  When RUN AUTON is pressed:
//   1. Switch to match screen, load assets if not loaded.
//   2. Build the game state from the form.
//   3. Run the auton generator, which yields events.
//   4. Each event maps to a Three.js animation (movement, particles, shots).
//   5. Wait for each event's animation before proceeding.
// ============================================================

import * as THREE from 'three';

import { Scene } from './render3d/scene.js';
import { buildHexGrid, loadFieldModel, loadHubModel } from './render3d/field.js';
import { loadBots } from './render3d/bots.js';
import { loadPieces } from './render3d/pieces.js';
import {
  pulseHub, spawnDust, confettiBurst, spawnDefensiveAura,
  fireDisruptorStreak, attachDisruptedRing,
  showAimCrosshair, animateShotBall, animatePickup, showScorePopup,
  sleep,
} from './render3d/effects.js';

import { buildSetupForm, readSetupState, showScreen } from './ui/setup.js';
import {
  setPhase, setScore, clearScores, clearLog, writeLog, wireLogToggle,
  showBanner, flashScreen,
} from './ui/hud.js';

import { buildGameState } from './sim/state.js';
import { runAuton } from './sim/auton.js';
import { hexCenter } from './sim/hex.js';
import { TICK_DURATION } from './config.js';

// ---- DOM refs ----
const canvas    = document.getElementById('three-canvas');
const btnRun    = document.getElementById('btn-run');
const btnReset  = document.getElementById('btn-reset');
const btnBack   = document.getElementById('btn-back');

// ---- State ----
let scene = null;
let currentBots = null;       // Map<botId, Object3D>
let currentPieces = null;     // { pieces: [{id, pos, taken, mesh}], group }
let effectsLayer = null;      // Group for transient effects (particles, streaks)
let aurasLayer = null;        // Group for persistent auras (defensive set)
let isRunning = false;

// ---- Setup form + UI initialization ----
buildSetupForm();
wireLogToggle();
setPhase('AUTON', 'READY', false);

function ensureScene() {
  if (scene) return scene;
  scene = new Scene(canvas);

  const grid = buildHexGrid({ visible: true });
  scene.scene.add(grid);

  // Layers for runtime effects
  effectsLayer = new THREE.Group();
  effectsLayer.name = 'effects';
  scene.scene.add(effectsLayer);

  aurasLayer = new THREE.Group();
  aurasLayer.name = 'auras';
  scene.scene.add(aurasLayer);

  scene.userData = { grid };
  return scene;
}

async function loadMatchAssets(config) {
  const s = ensureScene();

  // Clear previous bots
  if (currentBots) {
    currentBots.forEach(m => s.scene.remove(m));
    currentBots = null;
  }
  if (currentPieces) {
    s.scene.remove(currentPieces.group);
    currentPieces = null;
  }

  // Clear previous effects (particles, auras)
  while (effectsLayer.children.length > 0) effectsLayer.remove(effectsLayer.children[0]);
  while (aurasLayer.children.length > 0) aurasLayer.remove(aurasLayer.children[0]);

  // Load field/hub once (cached after first load)
  if (!s.userData.fieldLoaded) {
    const [field, hub] = await Promise.all([loadFieldModel(), loadHubModel()]);
    s.scene.add(field);
    s.scene.add(hub);
    s.userData.fieldLoaded = true;
    s.userData.field = field;
    s.userData.hub = hub;
  }

  // Bots and pieces — fresh every match
  const [bots, pieces] = await Promise.all([loadBots(config), loadPieces()]);
  bots.forEach(m => s.scene.add(m));
  s.scene.add(pieces.group);

  currentBots = bots;
  currentPieces = pieces;
}

// ============================================================
//  EVENT HANDLER — translates auton events into 3D animations
// ============================================================

async function handleEvent(event) {
  switch (event.type) {

    case 'log':
      writeLog(event.text, event.kind || '');
      return;

    case 'banner':
      showBanner(event.text, event.variant, event.duration);
      return;

    case 'set_phase':
      setPhase(event.phase, event.sub, event.isLive);
      return;

    case 'pause':
      await sleep(event.ms);
      return;

    case 'tick_move': {
      // Animate every bot moving from its current world pos to the next hex.
      // Spawn dust at each moving bot's start position.
      const promises = [];
      for (const [id, nextPos] of Object.entries(event.moves)) {
        const botMesh = currentBots.get(id);
        if (!botMesh) continue;
        const fromXZ = { x: botMesh.position.x, z: botMesh.position.z };
        const toXZ = hexCenter(nextPos.col, nextPos.row);
        if (Math.abs(fromXZ.x - toXZ.x) < 0.001 && Math.abs(fromXZ.z - toXZ.z) < 0.001) {
          continue;  // didn't move
        }
        spawnDust(effectsLayer, { x: fromXZ.x, z: fromXZ.z });
        promises.push(animateBotMove(botMesh, fromXZ, toXZ, TICK_DURATION));
      }
      await Promise.all(promises);
      return;
    }

    case 'pickup': {
      const piece = currentPieces.pieces.find(p => p.id === event.pieceId);
      const bot = currentBots.get(event.botId);
      if (piece && piece.mesh && bot) {
        await animatePickup(piece.mesh, bot);
      }
      return;
    }

    case 'park_score': {
      // Subtle effect: small confetti burst + score popup at the bot's hex
      confettiBurst(effectsLayer, { x: event.hexPos.x, y: 0.5, z: event.hexPos.z }, event.alliance);
      showScorePopup(canvas, scene.camera, event.hexPos, `+${event.points}`, event.alliance);
      return;
    }

    case 'defensive_set':
      spawnDefensiveAura(aurasLayer, event.hexPos, event.blocks);
      return;

    case 'disruptor_fire': {
      fireDisruptorStreak(effectsLayer, event.sourcePos, event.targetPos);
      // Persistent ring around the disrupted bot
      const targetMesh = currentBots.get(event.targetId);
      if (targetMesh) attachDisruptedRing(targetMesh);
      return;
    }

    case 'shot_aim':
      await showAimCrosshair(effectsLayer);
      return;

    case 'cargo_consumed':
      // No 3D effect for now — would be nice to update a held-cargo indicator
      // attached to the bot model in a future polish pass.
      return;

    case 'shot_resolve': {
      const fromXZ = event.hexPos;
      await animateShotBall(effectsLayer, fromXZ, event.hit);
      if (event.hit) {
        // Hit drama: hub pulse, screen flash, confetti at the hub, score popup
        pulseHub(scene.hubGlow);
        flashScreen(event.alliance);
        const hubXZ = hexCenter(7, 4);
        confettiBurst(effectsLayer, { x: hubXZ.x, y: 1.2, z: hubXZ.z }, event.alliance);
        showScorePopup(canvas, scene.camera, hubXZ, `+${event.points}`, event.alliance);
      }
      return;
    }

    case 'score_update':
      setScore(event.alliance, event.total);
      return;

    default:
      console.warn('Unknown event type:', event.type, event);
  }
}

// ============================================================
//  Bot move animation — tween world position over duration
// ============================================================

function animateBotMove(botMesh, fromXZ, toXZ, durationMs) {
  return new Promise(resolve => {
    const start = performance.now();
    const startV = new THREE.Vector3(fromXZ.x, 0, fromXZ.z);
    const endV = new THREE.Vector3(toXZ.x, 0, toXZ.z);

    function step(now) {
      const t = Math.min((now - start) / durationMs, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      botMesh.position.lerpVectors(startV, endV, eased);
      if (t < 1) requestAnimationFrame(step);
      else resolve();
    }
    requestAnimationFrame(step);
  });
}

// ============================================================
//  RUN AUTON button
// ============================================================

btnRun.addEventListener('click', async () => {
  if (isRunning) return;
  isRunning = true;
  btnRun.disabled = true;

  showScreen('match');
  clearScores();
  clearLog();
  setPhase('AUTON', 'LOADING', false);

  const config = readSetupState();

  try {
    await loadMatchAssets(config);

    // Build the game state and run the auton generator
    const state = buildGameState(config);

    for await (const event of runAuton(state)) {
      await handleEvent(event);
    }
  } catch (err) {
    console.error('Auton failed:', err);
    writeLog(`ERROR: ${err.message}`, 'miss');
    setPhase('ERROR', 'SEE LOG', false);
  } finally {
    isRunning = false;
    btnRun.disabled = false;
  }
});

btnReset.addEventListener('click', () => {
  buildSetupForm();
  setPhase('AUTON', 'READY', false);
});

btnBack.addEventListener('click', () => {
  if (isRunning) return;
  showScreen('setup');
});

// ---- Camera preset toggle ----
document.querySelectorAll('.view-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const view = btn.dataset.view;
    document.querySelectorAll('.view-btn').forEach(b => b.classList.toggle('is-active', b === btn));
    if (scene) scene.setCameraPreset(view);
  });
});

// ---- Number key shortcuts (dev aid) ----
window.addEventListener('keydown', (e) => {
  if (!scene) return;
  const map = { '1': 'topdown', '2': 'broadcast', '3': 'orbit' };
  if (map[e.key]) {
    scene.setCameraPreset(map[e.key]);
    document.querySelectorAll('.view-btn').forEach(b =>
      b.classList.toggle('is-active', b.dataset.view === map[e.key])
    );
  }
});

console.log('FRC AUTON · 3D · v0.4 — Phase 2: full auton simulation wired.');
