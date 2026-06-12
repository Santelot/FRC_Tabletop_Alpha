// ============================================================
//  ENTRY POINT — v0.7
// ============================================================
//  Wires the setup screen, the match screen, the Three.js scene,
//  the model loading, and the auton orchestrator.
//
//  v0.7 adds (on top of the Phase 3 base):
//   - CameraDirector: broadcast cuts on `focus` events (CU auton)
//   - Carried pieces: cones/cubes visibly ride the bots
//     (carry_attach / carry_detach / place_fumble / jam_clear)
//   - AUTON RECAP overlay after the final tally (both challenges)
//   - Fireworks finale + new sounds (place / fumble / climb / fanfare)
//   - setHubFx: the hub halo/glow switches off for placement games
// ============================================================

import * as THREE from 'three';

import { Scene } from './render3d/scene.js';
import { CameraDirector } from './render3d/camera.js';
import { buildArena } from './render3d/arena.js';
import { buildHexGrid, loadFieldModel, loadChallengeStructures } from './render3d/field.js';
import { loadBots, updateCargoIndicator } from './render3d/bots.js';
import { loadPieces } from './render3d/pieces.js';
import { loadModel } from './render3d/loader.js';
import {
  pulseHub, spawnDust, confettiBurst, spawnDefensiveAura, spawnBlockPins,
  fireDisruptorStreak, attachDisruptedRing, clearDisruptedRing,
  showAimCrosshair, animateShotBall, animatePickup, showScorePopup,
  spawnPlacedPiece, spawnChargeDock, animateDockRaise,
  attachCarriedPiece, detachCarriedPiece, fumblePiece,
  turnBotTo, sleep, setFxSpeed, animateVanish } from './render3d/effects.js';

import { buildSetupForm, readSetupState, showScreen } from './ui/setup.js';
import {
  setPhase, setScore, clearScores, clearLog, writeLog, wireLogToggle,
  showBanner, flashScreen,
} from './ui/hud.js';
import { deployTeleop, resetTeleop } from './ui/teleop.js';
import { showRecap, hideRecap } from './ui/recap.js';
import { showIntro } from './ui/intro.js';
import { buildHome } from './ui/home.js';

import { buildGameState } from './sim/state.js';
import { runAuton } from './sim/auton.js';
import { hexCenter, HUB_CENTER } from './sim/hex.js';
import { TICK_DURATION, ACTIVE_CHALLENGE } from './config.js';
import { CHALLENGE_CARDS } from './challenges.js';
import {
  TIMING, BOT_LABELS, AUDIO, CHARGE_DOCK, GRID_PLACEMENT,
  CARRIED_PIECE, RECAP, FINALE, INTRO, ARENA, FFWD,
} from './style.js';
import { play, initAudio, toggleMuted, isMuted } from './audio.js';

// ---- DOM refs ----
const canvas    = document.getElementById('three-canvas');
const btnRun    = document.getElementById('btn-run');
const btnReset  = document.getElementById('btn-reset');
const btnBack   = document.getElementById('btn-back');
const btnBeginTeleop = document.getElementById('btn-begin-teleop');
const matchScreen    = document.getElementById('screen-match');
const matchHud       = document.querySelector('.match-hud');

// ---- State ----
let scene = null;
let director = null;          // CameraDirector (v0.7)
let arena = null;             // LED ribbon / pylons / stage light (v0.8)
let currentBots = null;       // Map<botId, Object3D>
let currentPieces = null;
let effectsLayer = null;
let aurasLayer = null;
let labelMap = new Map();     // botId -> HTML element
let labelTickerUnsub = null;
let isRunning = false;
let lastScores = { red: 0, blue: 0 };   // carried into teleop
let currentConfig = null;               // bot config for the current match
let matchStats = {};                    // botId -> { points, chips[] } for the recap
let playSpeed = 1;                      // 1 = realtime, FFWD.mult = fast-forward

function setPlaySpeed(mult) {
  playSpeed = mult;
  setFxSpeed(mult);                     // every effect tween + sleep
  if (director) director.speed = mult;  // camera flights keep pace
  const btn = document.getElementById('btn-ffwd');
  if (btn) {
    btn.textContent = mult > 1 ? `▸▸ ×${mult}` : '▸▸ FFWD';
    btn.classList.toggle('is-ffwd-on', mult > 1);
  }
}

// ---- Setup form + UI initialization ----
buildSetupForm();
buildHome();
wireLogToggle();
setPhase('AUTON', 'READY', false);

function ensureScene() {
  if (scene) return scene;
  scene = new Scene(canvas);
  director = new CameraDirector(scene);
  director.speed = playSpeed;

  const grid = buildHexGrid({ visible: true });
  scene.scene.add(grid);

  effectsLayer = new THREE.Group();
  effectsLayer.name = 'effects';
  scene.scene.add(effectsLayer);

  aurasLayer = new THREE.Group();
  aurasLayer.name = 'auras';
  scene.scene.add(aurasLayer);

  if (ARENA.enabled) arena = buildArena(scene);

  scene.userData = { grid };
  return scene;
}

async function loadMatchAssets(config) {
  const s = ensureScene();

  // Clear previous bots (carried pieces are bot children, so they go too)
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

  // If the challenge changed since the last build, drop the cached field,
  // structures, and hex grid so they rebuild for the new game.
  if (s.userData.builtChallenge && s.userData.builtChallenge !== ACTIVE_CHALLENGE) {
    if (s.userData.field)      s.scene.remove(s.userData.field);
    if (s.userData.structures) s.scene.remove(s.userData.structures);
    if (s.userData.grid)       s.scene.remove(s.userData.grid);
    s.userData.fieldLoaded = false;
    const grid = buildHexGrid({ visible: true });
    s.scene.add(grid);
    s.userData.grid = grid;
  }
  s.userData.builtChallenge = ACTIVE_CHALLENGE;

  // Hub furniture (halo + warm glow) is Rapid React only — no hub in CU.
  const card = CHALLENGE_CARDS[ACTIVE_CHALLENGE];
  s.setHubFx(!card || card.scoringModel === 'shooter');

  // Load field + challenge structures once (cached after first load)
  if (!s.userData.fieldLoaded) {
    const field = await loadFieldModel();
    s.scene.add(field);
    const structures = await loadChallengeStructures();
    s.scene.add(structures);
    s.userData.fieldLoaded = true;
    s.userData.field = field;
    s.userData.structures = structures;
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
//  MATCH STATS — accumulated for the AUTON RECAP card
// ============================================================

function addStat(botId, label, points = 0) {
  if (!botId) return;
  if (!matchStats[botId]) matchStats[botId] = { points: 0, chips: [] };
  matchStats[botId].points += points;
  matchStats[botId].chips.push(points ? `${label} +${points}` : label);
}

function celebrateFinal() {
  if (!FINALE.fireworks || !effectsLayer) return;
  const tie = lastScores.red === lastScores.blue;
  const winner = lastScores.red > lastScores.blue ? 'red' : 'blue';
  for (let i = 0; i < FINALE.bursts; i++) {
    const alliance = tie ? (i % 2 === 0 ? 'red' : 'blue') : winner;
    setTimeout(() => {
      if (!effectsLayer) return;
      const x = (Math.random() - 0.5) * 26;
      const z = (Math.random() - 0.5) * 14;
      confettiBurst(effectsLayer, { x, y: 2 + Math.random() * 3, z }, alliance);
    }, (i / FINALE.bursts) * FINALE.spreadMs);
  }
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
      showBanner(event.text, event.variant, event.duration / playSpeed);
      if (event.text === '3' || event.text === '2' || event.text === '1') play('countdownBeep');
      else if (event.text === 'GO!') play('countdownGo');
      return;

    case 'set_phase':
      setPhase(event.phase, event.sub, event.isLive);
      if (event.phase === 'COMPLETE') {
        play('final');
        play('cheer');
        celebrateFinal();
        if (RECAP.enabled) {
          setTimeout(() => {
            showRecap({
              host:   matchScreen,
              stats:  matchStats,
              scores: { ...lastScores },
              config: currentConfig,
              onBeginTeleop: () => { if (btnBeginTeleop) btnBeginTeleop.click(); },
            });
          }, RECAP.autoShowMs);
        }
      }
      return;

    case 'pause':
      await sleep(event.ms);
      return;

    // ---- Camera director (v0.7) — fire-and-forget, never blocks the show ----
    case 'focus':
      if (arena) {
        if (event.zoom === 'home') arena.setStage(0, 0, false);
        // stageX/stageZ (when present) pin the spotlight to the subject —
        // the camera may frame a wider composition (e.g. RR shot midpoint).
        else arena.setStage(event.stageX ?? event.x, event.stageZ ?? event.z, true);
      }
      if (!director) return;
      if (event.zoom === 'home') director.returnHome();
      else director.cue({ x: event.x, z: event.z }, event.zoom);
      return;

    case 'face_point': {
      const bot = currentBots.get(event.botId);
      if (bot) await turnBotTo(bot, { x: event.x, z: event.z });
      return;
    }

    // ---- Carried pieces (v0.7) — preloads + midfield pickups ride the bot ----
    case 'carry_attach': {
      if (!CARRIED_PIECE.enabled) return;
      const bot = currentBots.get(event.botId);
      if (!bot) return;
      const piece = await loadModel(event.modelKey);
      attachCarriedPiece(bot, piece);
      return;
    }

    case 'carry_detach': {
      const bot = currentBots.get(event.botId);
      if (bot) detachCarriedPiece(bot);
      return;
    }

    case 'place_fumble': {
      play('fumble');
      addStat(event.botId, 'BOBBLE', 0);
      const piece = await loadModel(event.modelKey);
      await fumblePiece(effectsLayer, piece, { x: event.x, z: event.z },
                        { x: event.towardX, z: event.towardZ });
      return;
    }

    case 'jam_clear': {
      const bot = currentBots.get(event.botId);
      if (bot) clearDisruptedRing(bot);
      return;
    }

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
            await animateBotMove(botMesh, fromXZ, toXZ, TIMING.tickDuration / playSpeed);
          })());
        } else {
          // Mecanum/Swerve: just translate (no facing change)
          spawnDust(effectsLayer, fromXZ);
          promises.push(animateBotMove(botMesh, fromXZ, toXZ, TIMING.tickDuration / playSpeed));
        }
      }
      if (promises.length > 0) play('move', { pitchJitter: AUDIO.movePitchJitter });
      await Promise.all(promises);
      return;
    }

    case 'pickup': {
      const piece = currentPieces.pieces.find(p => p.id === event.pieceId);
      const bot = currentBots.get(event.botId);
      if (piece && piece.mesh && bot) {
        play('pickup');
        if (event.style === 'vanish') await animateVanish(piece.mesh);
        else await animatePickup(piece.mesh, bot);
      }
      return;
    }

    case 'cargo_update': {
      const bot = currentBots.get(event.botId);
      if (bot) updateCargoIndicator(bot, event.held, event.max);
      return;
    }

    case 'park_score': {
      play('park');
      addStat(event.botId, event.label || 'TAXI', event.points);
      confettiBurst(effectsLayer, { x: event.hexPos.x, y: 0.5, z: event.hexPos.z }, event.alliance);
      showScorePopup(canvas, scene.camera, event.hexPos, `+${event.points}`, event.alliance);
      return;
    }

    case 'place_piece': {
      play('place');
      const tierLbl = event.tier === 'L2' ? 'HIGH' : 'MID';
      addStat(event.botId, `${(event.kind || 'piece').toUpperCase()} ${tierLbl}`, event.points);
      const piece = await loadModel(event.modelKey);
      const layer = (currentPieces && currentPieces.group) ? currentPieces.group : effectsLayer;
      // Resolve placement: base tier values, then per-piece overrides
      // (GRID_PLACEMENT.cone.L2.dy etc. — see style.js).
      const base = GRID_PLACEMENT[event.tier] || GRID_PLACEMENT.L1;
      const over = (event.kind && GRID_PLACEMENT[event.kind]?.[event.tier]) || {};
      const tier = { ...base, ...over };
      const into = event.alliance === 'red' ? -tier.dInto : tier.dInto;   // nudge toward the grid wall
      const toXZ = { x: event.x + into, z: event.z + (tier.dSide || 0) };
      const fromXZ = { x: event.fromX ?? event.x, z: event.fromZ ?? event.z };
      await spawnPlacedPiece(layer, piece, toXZ, fromXZ, tier.dy);
      confettiBurst(effectsLayer, { x: toXZ.x, y: tier.dy + 0.5, z: toXZ.z }, event.alliance);
      showScorePopup(canvas, scene.camera, { x: toXZ.x, z: toXZ.z }, `+${event.points}`, event.alliance);
      return;
    }

    case 'charge_dock': {
      play('climb');
      addStat(event.botId, event.engaged ? 'ENGAGED' : 'DOCKED', event.points);
      const bot = currentBots.get(event.botId);
      const xz = { x: event.x, z: event.z };
      if (bot) await animateDockRaise(bot, xz, CHARGE_DOCK.raiseY, CHARGE_DOCK.climbMs, event.engaged);
      if (event.engaged) { play('fanfare'); play('cheer'); }
      spawnChargeDock(effectsLayer, { x: event.x, y: CHARGE_DOCK.raiseY, z: event.z }, event.engaged);
      showScorePopup(canvas, scene.camera, { x: event.x, z: event.z }, `+${event.points}`, event.alliance);
      return;
    }

    case 'defensive_set':
      addStat(event.botId, `PINS ×${event.blocks}`, 0);
      spawnDefensiveAura(aurasLayer, event.hexPos, event.blocks);
      spawnBlockPins(aurasLayer, event.pinPositions, event.alliance);
      return;

    case 'disruptor_fire': {
      play('disruptor');
      addStat(event.sourceId, 'JAM', 0);
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
      play('shotWhoosh');
      await animateShotBall(effectsLayer, fromXZ, event.hit);
      play(event.hit ? 'hit' : 'miss');
      if (event.hit) {
        addStat(event.botId, 'HUB', event.points);
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
      play('score');
      if (arena) arena.pulse(event.alliance);
      lastScores[event.alliance] = event.total;
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

  initAudio();  // create/resume the AudioContext within this user gesture

  // Fresh match → tear down any previous teleop panel / recap, restore the HUD.
  resetTeleop();
  hideRecap();
  if (btnBeginTeleop) btnBeginTeleop.classList.add('is-hidden');

  showScreen('match');
  clearScores();
  clearLog();
  setPhase('AUTON', 'LOADING', false);

  const config = readSetupState();
  currentConfig = config;
  lastScores = { red: 0, blue: 0 };
  matchStats = {};

  let intro = null;
  try {
    // The MATCH PREVIEW card goes up instantly; assets load behind it.
    if (INTRO.enabled) intro = showIntro({ host: matchScreen, config });
    await loadMatchAssets(config);
    if (intro) await intro.start();              // arms START MATCH ▸, waits for the click
    if (director) await director.sweepIn();      // blimp-to-broadcast establishing shot

    const state = buildGameState(config);

    for await (const event of runAuton(state)) {
      await handleEvent(event);
    }
    // Auton finished cleanly → offer the teleop tracker.
    if (btnBeginTeleop) btnBeginTeleop.classList.remove('is-hidden');
  } catch (err) {
    if (intro) intro.destroy();
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
  resetTeleop();
  hideRecap();
  if (btnBeginTeleop) btnBeginTeleop.classList.add('is-hidden');
  showScreen('setup');
});

// ---- Begin Teleop → deploy the full-screen tracker ----
if (btnBeginTeleop) {
  btnBeginTeleop.addEventListener('click', () => {
    initAudio();
    hideRecap();
    btnBeginTeleop.classList.add('is-hidden');
    deployTeleop({
      screen:  matchScreen,
      hud:     matchHud,            // relocated to the top of the tracker
      config:  currentConfig,
      scores:  lastScores,
      onExit:  () => showScreen('setup'),
    });
  });
}

// ---- Camera preset toggle ----
document.querySelectorAll('.view-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const view = btn.dataset.view;
    document.querySelectorAll('.view-btn').forEach(b => b.classList.toggle('is-active', b === btn));
    if (director) director.cancel();   // manual view change always wins
    if (scene) scene.setCameraPreset(view);
  });
});

// ---- Number key shortcuts ----
window.addEventListener('keydown', (e) => {
  if (!scene) return;
  const map = { '1': 'topdown', '2': 'broadcast', '3': 'orbit' };
  if (map[e.key]) {
    if (director) director.cancel();
    scene.setCameraPreset(map[e.key]);
    document.querySelectorAll('.view-btn').forEach(b =>
      b.classList.toggle('is-active', b.dataset.view === map[e.key])
    );
  }
});

// ---- Sound mute toggle ----
const btnMute = document.getElementById('btn-mute');
function syncMuteButton() {
  if (!btnMute) return;
  const m = isMuted();
  btnMute.textContent = m ? 'SOUND OFF' : 'SOUND ON';
  btnMute.style.opacity = m ? '0.55' : '1';
  btnMute.setAttribute('aria-pressed', String(!m));
}
if (btnMute) {
  syncMuteButton();
  btnMute.addEventListener('click', () => {
    initAudio();      // ensure the context exists the first time they unmute
    toggleMuted();
    syncMuteButton();
  });
}

// ---- Fast-forward toggle (v0.9) ----
(function buildFfwdButton() {
  if (!FFWD.enabled) return;
  const btn = document.createElement('button');
  btn.id = 'btn-ffwd';
  btn.className = 'match-btn';
  btn.title = 'Fast-forward the auton playback';
  btn.textContent = '▸▸ FFWD';
  btn.addEventListener('click', () => {
    initAudio();
    setPlaySpeed(playSpeed > 1 ? 1 : FFWD.mult);
  });
  const css = document.createElement('style');
  css.textContent = `#btn-ffwd.is-ffwd-on { background: var(--gold,#ffd23f); color: var(--ink,#16162b);
    border-color: var(--gold,#ffd23f); font-weight: 800; }`;
  document.head.appendChild(css);
  if (btnMute && btnMute.parentElement) btnMute.insertAdjacentElement('beforebegin', btn);
  else document.querySelector('.match-topbar')?.appendChild(btn);
})();

// ---- Topbar version sync (no-op if the element isn't found) ----
{
  const t = document.querySelector('.topbar__title');
  if (t && /FRC AUTON/.test(t.textContent)) t.textContent = 'FRC AUTON · 3D · v1.6';
}

console.log('FRC AUTON · 3D · v1.6 — BFS pathfinding: bots route around obstacles instead of pacing.');
