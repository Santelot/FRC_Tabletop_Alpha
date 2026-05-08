// ============================================================
//  ENTRY POINT
// ============================================================
//  Wires the setup screen, the match screen, the Three.js scene,
//  and the model loading. This is Phase 1 — no simulation yet:
//  pressing RUN AUTON loads bots and pieces into the 3D scene
//  but doesn't animate them. Sim layer is wired in Phase 2.
// ============================================================

import { Scene } from './render3d/scene.js';
import { buildHexGrid, loadFieldModel, loadHubModel } from './render3d/field.js';
import { loadBots } from './render3d/bots.js';
import { loadPieces } from './render3d/pieces.js';
import { buildSetupForm, readSetupState, showScreen } from './ui/setup.js';
import { setPhase, clearScores, clearLog, writeLog, wireLogToggle } from './ui/hud.js';

// ---- DOM refs ----
const canvas    = document.getElementById('three-canvas');
const btnRun    = document.getElementById('btn-run');
const btnReset  = document.getElementById('btn-reset');
const btnBack   = document.getElementById('btn-back');

// ---- State ----
let scene = null;            // Three.js Scene wrapper
let currentBots = null;      // Map<botId, Object3D>
let currentPieces = null;    // { pieces, group }
let isRunning = false;

// ---- Setup form ----
buildSetupForm();
wireLogToggle();
setPhase('AUTON', 'READY', false);

// ---- Lazy-init the Three.js scene the first time we enter match mode ----
function ensureScene() {
  if (scene) return scene;

  scene = new Scene(canvas);

  // Add hex grid (development aid; can be hidden later)
  const grid = buildHexGrid({ visible: true });
  scene.scene.add(grid);
  scene.userData = { grid };

  return scene;
}

// ---- Loading: field, hub, bots, pieces ----
async function loadMatchAssets(config) {
  const s = ensureScene();

  // Clear previous bots and pieces if any
  if (currentBots) {
    currentBots.forEach(m => s.scene.remove(m));
    currentBots = null;
  }
  if (currentPieces) {
    s.scene.remove(currentPieces.group);
    currentPieces = null;
  }

  // Load field/hub once
  if (!s.userData.fieldLoaded) {
    const [field, hub] = await Promise.all([loadFieldModel(), loadHubModel()]);
    s.scene.add(field);
    s.scene.add(hub);
    s.userData.fieldLoaded = true;
    s.userData.field = field;
    s.userData.hub = hub;
  }

  // Bots and pieces — fresh every match
  const [bots, pieces] = await Promise.all([
    loadBots(config),
    loadPieces(),
  ]);
  bots.forEach(m => s.scene.add(m));
  s.scene.add(pieces.group);

  currentBots = bots;
  currentPieces = pieces;
}

// ---- Buttons ----
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
    setPhase('AUTON', 'READY · PHASE 2 NOT WIRED', false);
    writeLog('Field loaded. Bots placed at start positions.', 'event');
    writeLog('Cargo pieces deterministically placed.', 'event');
    writeLog('Phase 2 (movement + scoring) wires in next iteration.', 'event');
  } catch (err) {
    console.error('Failed to load match assets:', err);
    writeLog(`ERROR: ${err.message}`, 'miss');
    setPhase('ERROR', 'SEE LOG', false);
  } finally {
    isRunning = false;
    btnRun.disabled = false;
  }
});

btnReset.addEventListener('click', () => {
  // Re-build form with defaults
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

// ---- Number key shortcuts for camera presets (dev aid) ----
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

console.log('FRC AUTON · 3D · v0.3 — Phase 1 ready. Press RUN AUTON to load bots into the scene.');
