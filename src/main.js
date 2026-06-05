// ============================================================
//  ENTRY POINT — Phase 3
// ============================================================
//  Wires the setup screen, the match screen, the Three.js scene,
//  the model loading, and the auton orchestrator.
//
//  This phase adds:
//   - Per-drivetrain rotation (Tank/WC turn before moving;
//     all bots turn to face the hub before shooting)
//   - Cargo indicator updates on each pickup/consumed event
//   - Persistent bot ID labels projected from world coords
// ============================================================

import * as THREE from 'three';

import { Scene } from './render3d/scene.js';
import { buildHexGrid, loadFieldModel, loadHubModel } from './render3d/field.js';
import { loadBots, updateCargoIndicator } from './render3d/bots.js';
import { loadPieces } from './render3d/pieces.js';
import {
  pulseHub, spawnDust, confettiBurst, spawnDefensiveAura,
  fireDisruptorStreak, attachDisruptedRing,
  showAimCrosshair, animateShotBall, animatePickup, showScorePopup,
  turnBotTo, sleep,
} from './render3d/effects.js';

import { buildSetupForm, readSetupState, showScreen } from './ui/setup.js';
import {
  setPhase, setScore, clearScores, clearLog, writeLog, wireLogToggle,
  showBanner, flashScreen,
} from './ui/hud.js';

import { buildGameState } from './sim/state.js';
import { runAuton } from './sim/auton.js';
import { hexCenter, HUB_CENTER } from './sim/hex.js';
import { TICK_DURATION } from './config.js';
import { TIMING, BOT_LABELS } from './style.js';

// ---- DOM refs ----
const canvas    = document.getElementById('three-canvas');
const btnRun    = document.getElementById('btn-run');
const btnReset  = document.getElementById('btn-reset');
const btnBack   = document.getElementById('btn-back');

// ---- State ----
let scene = null;
let currentBots = null;       // Map<botId, Object3D>
let currentPieces = null;
let effectsLayer = null;
let aurasLayer = null;
let labelMap = new Map();     // botId -> HTML element
let labelTickerUnsub = null;
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

  // Clear effects + auras
  while (effectsLayer.children.length > 0) effectsLayer.remove(effectsLayer.children[0]);
  while (aurasLayer.children.length > 0) aurasLayer.remove(aurasLayer.children[0]);

  // Clear bot labels
  clearBotLabels();

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

  // Build bot labels (HTML divs over the canvas)
  if (BOT_LABELS.enabled) buildBotLabels(bots);
}

// ============================================================
//  BOT LABELS — HTML divs anchored to projected world coords
// ============================================================

function buildBotLabels(bots) {
  const container = canvas.parentElement;
  bots.forEach((mesh, id) => {
    const div = document.createElement('div');
    div.className = `bot-label bot-label--${mesh.userData.alliance}`;
    div.textContent = id;
    container.appendChild(div);
    labelMap.set(id, div);
  });

  // Per-frame projection update
  if (labelTickerUnsub) labelTickerUnsub();
  labelTickerUnsub = scene.onTick(() => {
    updateLabelPositions();
  });
}

function clearBotLabels() {
  if (labelTickerUnsub) {
    labelTickerUnsub();
    labelTickerUnsub = null;
  }
  labelMap.forEach(el => el.remove());
  labelMap.clear();
}

const _labelV = new THREE.Vector3();
function updateLabelPositions() {
  if (!scene || labelMap.size === 0) return;
  const rect = canvas.getBoundingClientRect();
  const halfW = rect.width / 2;
  const halfH = rect.height / 2;

  labelMap.forEach((el, id) => {
    const mesh = currentBots && currentBots.get(id);
    if (!mesh) {
      el.style.display = 'none';
      return;
    }
    _labelV.set(mesh.position.x, BOT_LABELS.yOffset, mesh.position.z);
    _labelV.project(scene.camera);

    // Hide if behind camera (z > 1)
    if (_labelV.z > 1) {
      el.style.display = 'none';
      return;
    }

    const screenX = _labelV.x * halfW + halfW;
    const screenY = -_labelV.y * halfH + halfH;
    el.style.transform = `translate(-50%, -100%) translate(${screenX}px, ${screenY}px)`;
    el.style.display = 'block';
  });
}

// ============================================================
//  EVENT HANDLER
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
      // Per-drivetrain handling:
      //   Tank / West Coast: rotate-then-translate (sequential)
      //   Mecanum / Swerve : translate only (omnidirectional)
      // Bots that don't move at all skip everything.
      const promises = [];
      for (const [id, nextPos] of Object.entries(event.moves)) {
        const botMesh = currentBots.get(id);
        if (!botMesh) continue;
        const fromXZ = { x: botMesh.position.x, z: botMesh.position.z };
        const toXZ = hexCenter(nextPos.col, nextPos.row);
        if (Math.abs(fromXZ.x - toXZ.x) < 0.001 && Math.abs(fromXZ.z - toXZ.z) < 0.001) {
          continue;  // didn't move
        }

        const drivetrain = botMesh.userData.drivetrain;
        const isOriented = drivetrain === 'tank' || drivetrain === 'west_coast';

        if (isOriented && TIMING.rotateBeforeMove) {
          // Tank/WC: rotate then move sequentially
          promises.push((async () => {
            await turnBotTo(botMesh, toXZ);
            spawnDust(effectsLayer, fromXZ);
            await animateBotMove(botMesh, fromXZ, toXZ, TIMING.tickDuration);
          })());
        } else {
          // Mecanum/Swerve: just translate (no facing change)
          spawnDust(effectsLayer, fromXZ);
          promises.push(animateBotMove(botMesh, fromXZ, toXZ, TIMING.tickDuration));
        }
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

    case 'cargo_update': {
      const bot = currentBots.get(event.botId);
      if (bot) updateCargoIndicator(bot, event.held, event.max);
      return;
    }

    case 'park_score': {
      confettiBurst(effectsLayer, { x: event.hexPos.x, y: 0.5, z: event.hexPos.z }, event.alliance);
      showScorePopup(canvas, scene.camera, event.hexPos, `+${event.points}`, event.alliance);
      return;
    }

    case 'defensive_set':
      spawnDefensiveAura(aurasLayer, event.hexPos, event.blocks);
      return;

    case 'disruptor_fire': {
      fireDisruptorStreak(effectsLayer, event.sourcePos, event.targetPos);
      const targetMesh = currentBots.get(event.targetId);
      if (targetMesh) attachDisruptedRing(targetMesh);
      return;
    }

    case 'face_hub': {
      const bot = currentBots.get(event.botId);
      if (!bot) return;
      const hubXZ = hexCenter(HUB_CENTER.col, HUB_CENTER.row);
      await turnBotTo(bot, hubXZ);
      return;
    }

    case 'shot_aim':
      await showAimCrosshair(effectsLayer);
      return;

    case 'cargo_consumed':
      // visual update happens via cargo_update event right after
      return;

    case 'shot_resolve': {
      const fromXZ = event.hexPos;
      await animateShotBall(effectsLayer, fromXZ, event.hit);
      if (event.hit) {
        pulseHub(scene.hubGlow);
        if (scene.flashHubHalo) scene.flashHubHalo();
        flashScreen(event.alliance);
        const hubXZ = hexCenter(HUB_CENTER.col, HUB_CENTER.row);
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
//  Buttons
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

// ---- Number key shortcuts ----
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

console.log('FRC AUTON · 3D · v0.5 — Phase 3: rotation, labels, cargo indicators, hex glow.');
