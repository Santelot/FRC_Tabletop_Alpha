// ============================================================
//  UI · TELEOP — the DRIVER STATION (v1.0)
// ============================================================
//  Full-screen post-auton tracker, rebuilt as a three-zone console:
//
//    DECK (left)     — the on-deck robot: identity, stats, and the
//                      live movement diagram (engine unchanged).
//    CONSOLE (center)— the scoring keypad. Keys are grouped by game
//                      piece and wear its identity (cone gold, cube
//                      violet, endgame cyan); HIGH keys sit taller
//                      than MID, so a Charged Up console literally
//                      reads like the grid. Locked endgame keys show
//                      a live "R7 · in N" unlock countdown.
//    FEED (right)    — UP NEXT queue + a play-by-play ticker of
//                      every point scored, with UNDO LAST.
//
//  Still RELOCATES the real match HUD to the top, still drives the
//  state machine in ../teleop.js, same deployTeleop/resetTeleop
//  contract. Long-press-to-subtract on every key is unchanged.
// ============================================================

import { DRIVETRAINS } from '../config.js';
import {
  TELEOP_CONFIG, actionAvailable, createTeleopState, nextCandidates,
  upcomingOrder, setActive, endTurn, advanceRound, applyScore, computeWinner,
} from '../teleop.js';
import { setPhase, setScore } from './hud.js';
import { play } from '../audio.js';

let root = null;          // .teleop full-screen layer
let winnerEl = null;
let state = null;
let config = null;
let onExit = null;
let hudEl = null;         // the relocated .match-hud element
let hudHome = null;       // where to put it back
let els = {};
let history = [];         // [{alliance, delta, label}] — fuels UNDO LAST

// ============================================================
//  ENTRY / TEARDOWN
// ============================================================
export function deployTeleop({ screen, hud, config: cfg, scores, onExit: exit }) {
  resetTeleop();
  config = cfg;
  onExit = exit;
  history = [];
  state = createTeleopState(scores);

  build(screen);

  // Relocate the real scoreboard into our header and restyle it for the top.
  if (hud) {
    hudEl = hud;
    hudHome = hud.parentElement;
    els.header.appendChild(hud);
    hud.classList.add('is-teleop');
    setScore('red', state.scores.red);
    setScore('blue', state.scores.blue);
  }
  refreshHudCenter();
  renderRounds();
  if (els.feed) els.feed.innerHTML = '<div class="feed__empty">Every point lands here.</div>';

  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add('is-deployed')));
  resolveNext();
}

export function resetTeleop() {
  // Put the scoreboard back where it came from.
  if (hudEl && hudHome) {
    hudEl.classList.remove('is-teleop');
    hudHome.appendChild(hudEl);
  }
  hudEl = null; hudHome = null;
  if (root) { root.remove(); root = null; }
  if (winnerEl) { winnerEl.remove(); winnerEl = null; }
  state = null; config = null; els = {}; history = [];
}

// ============================================================
//  DOM
// ============================================================
function build(screen) {
  root = document.createElement('div');
  root.className = 'teleop';
  root.innerHTML = `
    <div class="teleop__header" id="tele-header"></div>
    <button class="teleop__exit" id="tele-exit-top" type="button" title="Back to setup">EXIT</button>
    <div class="teleop__stage">
      <div class="teleop__rounds" id="tele-rounds"></div>
      <div class="station">
        <div class="station__deck" id="tele-turn"></div>
        <div class="station__console">
          <div class="console" id="tele-controls"></div>
        </div>
        <div class="station__feed">
          <div class="feed__block">
            <div class="feed__head">UP NEXT</div>
            <div class="feed__next" id="tele-next"></div>
          </div>
          <div class="feed__block feed__block--grow">
            <div class="feed__head">PLAY-BY-PLAY
              <button class="feed__undo" id="tele-undo" type="button" title="Reverse the last entry">⟲ UNDO LAST</button>
            </div>
            <div class="feed__ticker" id="tele-feed"></div>
          </div>
        </div>
      </div>
    </div>
  `;
  screen.appendChild(root);

  els = {
    header:   root.querySelector('#tele-header'),
    rounds:   root.querySelector('#tele-rounds'),
    turn:     root.querySelector('#tele-turn'),
    controls: root.querySelector('#tele-controls'),
    next:     root.querySelector('#tele-next'),
    feed:     root.querySelector('#tele-feed'),
    undo:     root.querySelector('#tele-undo'),
  };

  buildControls();
  els.undo.addEventListener('click', undoLast);
  root.querySelector('#tele-exit-top').addEventListener('click', () => {
    resetTeleop();
    if (onExit) onExit();
  });
}

const GRP_TITLES = { hub: 'HUB', cone: 'CONE', cube: 'CUBE', endgame: 'ENDGAME' };

function keyMarkup(a) {
  const sign = a.points >= 0 ? '+' : '';
  // Grouped piece keys show their TIER as the label; the cluster header
  // already names the piece. Solo keys (HUB / DOCK / ENGAGE) keep theirs.
  const label = a.tier ? a.tier.toUpperCase() : a.label;
  return `
    <button class="key key--${a.tone || 'gold'}${a.tier ? ` key--${a.tier}` : ''}"
            id="tele-act-${a.id}" type="button">
      <span class="key__label">${label}</span>
      <span class="key__val">${sign}${a.points}</span>
      ${a.hint ? `<span class="key__hint">${a.hint}</span>` : ''}
      <span class="key__lock"></span>
    </button>`;
}

function buildControls() {
  els.actionBtns = {};
  const actions = TELEOP_CONFIG.actions;

  // Cluster keys by group, preserving data order.
  const groups = [];
  for (const a of actions) {
    const g = a.grp || (a.rounds ? 'endgame' : 'hub');
    let bucket = groups.find(x => x.g === g);
    if (!bucket) { bucket = { g, items: [] }; groups.push(bucket); }
    bucket.items.push(a);
  }

  let html = '';
  for (const { g, items } of groups) {
    html += `
      <div class="console__grp console__grp--${g}">
        <div class="console__grp-head">${GRP_TITLES[g] || g.toUpperCase()}</div>
        <div class="console__grp-keys">${items.map(keyMarkup).join('')}</div>
      </div>`;
  }
  els.controls.innerHTML = html;
  els.controls.insertAdjacentHTML('afterend', `
    <div class="console__endbar">
      <button class="tele-btn tele-btn--end" id="tele-end" type="button">END TURN ▸</button>
    </div>`);

  for (const a of actions) {
    const btn = els.controls.querySelector(`#tele-act-${a.id}`);
    els.actionBtns[a.id] = btn;
    wireAction(btn, a);
  }
  els.end = root.querySelector('#tele-end');
  els.end.addEventListener('click', onEnd);
}

// ============================================================
//  RENDER
// ============================================================
function refreshHudCenter() {
  setPhase('TELEOP', `ROUND ${state.round} / ${TELEOP_CONFIG.rounds}`, true);
}

function renderRounds() {
  let html = '';
  for (let r = 1; r <= TELEOP_CONFIG.rounds; r++) {
    const cls = r < state.round ? 'is-done' : r === state.round ? 'is-active' : '';
    html += `<div class="round-pip ${cls}">${r}</div>`;
  }
  els.rounds.innerHTML = html;
}

function dt(id) { return DRIVETRAINS[config[id].drivetrain].label; }

function miniChip(id) {
  return `<div class="upnext-chip upnext-chip--${config[id].alliance}">
            <span class="upnext-chip__id">${id}</span><span class="upnext-chip__dt">${dt(id)}</span>
          </div>`;
}

// ============================================================
//  Movement diagram — shows HOW the on-deck drivetrain moves in
//  teleop. The reachable hexes are a STATIC gold backdrop; the
//  only thing that travels is the small alliance robot token,
//  sliding from the centre into a reachable hex and back.
//    • Omni (swerve/mecanum): slides in every direction without
//      turning (nose stays put) — swerve reaches 2, mecanum 1.
//    • Directional (WC/tank): slides forward/back along its
//      heading; the heading then rotates a 60° step (the line
//      swings with it) to show it can reorient, and repeats.
//  SMIL-driven, self-looping, no JS lifecycle.
// ============================================================
const MOVE_S = 15;
const MOVE_SQ3 = Math.sqrt(3);
const movePx = (q, r) => ({ x: MOVE_S * 1.5 * q, y: MOVE_S * MOVE_SQ3 * (r + q / 2) });
const moveCubeDist = (q, r) => (Math.abs(q) + Math.abs(r) + Math.abs(q + r)) / 2;
function moveHexPts(cx, cy, rad = MOVE_S) {
  const p = [];
  for (let i = 0; i < 6; i++) { const a = Math.PI / 180 * 60 * i; p.push(`${(cx + rad * Math.cos(a)).toFixed(1)},${(cy + rad * Math.sin(a)).toFixed(1)}`); }
  return p.join(' ');
}

// reach predicate + legend + motion kind. Omni carries a tour of target
// cells; directional carries its forward/back range (in hexes).
function moveSpec(drivetrain) {
  switch (drivetrain) {
    case 'swerve':  return { kind: 'omni', rotate: 'free', move: 2, reachLbl: 'omnidirectional',
      reach: (q, r) => moveCubeDist(q, r) >= 1,
      targets: [[0,-1],[2,-2],[2,0],[0,1],[-2,2],[-2,0]] };
    case 'mecanum': return { kind: 'omni', rotate: 'free', move: 1, reachLbl: 'omnidirectional',
      reach: (q, r) => moveCubeDist(q, r) === 1,
      targets: [[0,-1],[1,-1],[1,0],[0,1],[-1,1],[-1,0]] };
    case 'west_coast': return { kind: 'dir', rotate: '1 AP', move: 2, reachLbl: 'forward / back',
      reach: (q, r) => q === 0 && [-2,-1,1,2].includes(r), far: 2 };
    default: return { kind: 'dir', rotate: '1 AP', move: 1, reachLbl: 'forward / back',
      reach: (q, r) => q === 0 && (r === -1 || r === 1), far: 1 };  // tank
  }
}

// Omni: token hops centre → each target → centre, touring every direction.
function omniTimeline(targets) {
  const OUT = 330, HOLD = 120, BACK = 300;
  let t = 0; const times = [0], vals = ['0 0'];
  for (const [q, r] of targets) {
    const { x, y } = movePx(q, r); const at = `${x.toFixed(1)} ${y.toFixed(1)}`;
    t += OUT;  times.push(t); vals.push(at);
    t += HOLD; times.push(t); vals.push(at);
    t += BACK; times.push(t); vals.push('0 0');
  }
  return { values: vals.join('; '), keyTimes: times.map(x => (x / t).toFixed(4)).join(';'), dur: (t / 1000).toFixed(2) + 's' };
}

// Directional: forward/back demo on a heading, then rotate a 60° step.
// Rotate (on the wrapper) and translate (on the token) share ONE timeline,
// so motion only happens while parked and rotation only while centred.
// Steps are random multiples of 60° summing to 360° → seamless loop.
function dirTimelines(far) {
  const dist = MOVE_SQ3 * MOVE_S * far;
  const headings = [0]; let rem = 360;
  while (rem > 0) {
    const opts = []; for (let s = 120; s <= Math.min(rem, 180); s += 60) opts.push(s);
    const step = opts.length ? opts[Math.floor(Math.random() * opts.length)] : rem; // rem===60 → forced
    rem -= step; headings.push(headings[headings.length - 1] + step);
  }
  const OUT = 430, HOLD = 250, IN = 380, ROT = 520;
  const FWD = `0 ${(-dist).toFixed(1)}`, BACK = `0 ${dist.toFixed(1)}`, CTR = '0 0';
  let t = 0; const times = [0], ang = [`${headings[0]} 0 0`], off = [CTR];
  const key = (a, o) => { times.push(t); ang.push(`${a} 0 0`); off.push(o); };
  for (let i = 0; i < headings.length - 1; i++) {
    const a = headings[i];
    t += OUT;  key(a, FWD);
    t += HOLD; key(a, FWD);
    t += IN;   key(a, CTR);
    t += OUT;  key(a, BACK);
    t += HOLD; key(a, BACK);
    t += IN;   key(a, CTR);
    t += ROT;  key(headings[i + 1], CTR);
  }
  const keyTimes = times.map(x => (x / t).toFixed(4)).join(';');
  const dur = (t / 1000).toFixed(2) + 's';
  return { rotate: { values: ang.join('; '), keyTimes, dur }, translate: { values: off.join('; '), keyTimes, dur } };
}

// Omni free-turn: the token also rotates on its OWN cadence (random turns
// of varying size with holds, one full turn per loop → seamless), decoupled
// from the slide so it reads as "movement isn't tied to facing".
function omniRotTimeline() {
  const n = 3 + Math.floor(Math.random() * 2);          // 3–4 turns per loop
  const w = []; for (let i = 0; i < n; i++) w.push(0.6 + Math.random());
  const tot = w.reduce((a, b) => a + b, 0);
  const stops = [0]; let acc = 0;
  for (let i = 0; i < n; i++) { acc += w[i] / tot * 360; stops.push(Math.round(acc)); }
  stops[stops.length - 1] = 360;                        // close the loop exactly
  const TURN = 620, HOLD = 880;
  let t = 0; const times = [0], vals = ['0 0 0'];
  t += HOLD; times.push(t); vals.push('0 0 0');
  for (let i = 1; i < stops.length; i++) {
    t += TURN; times.push(t); vals.push(`${stops[i]} 0 0`);
    t += HOLD; times.push(t); vals.push(`${stops[i]} 0 0`);
  }
  return { values: vals.join('; '), keyTimes: times.map(x => (x / t).toFixed(4)).join(';'), dur: (t / 1000).toFixed(2) + 's' };
}

function moveTokenArt() {
  return `<polygon class="move-bot__body" points="${moveHexPts(0, 0, MOVE_S * 0.5)}"/>
          <polygon class="move-bot__nose" points="0,${(-MOVE_S * 0.92).toFixed(1)} ${(-MOVE_S * 0.28).toFixed(1)},${(-MOVE_S * 0.42).toFixed(1)} ${(MOVE_S * 0.28).toFixed(1)},${(-MOVE_S * 0.42).toFixed(1)}"/>`;
}
function moveAnim(type, tl) {
  return `<animateTransform attributeName="transform" type="${type}" values="${tl.values}" keyTimes="${tl.keyTimes}" dur="${tl.dur}" repeatCount="indefinite"/>`;
}

function movementDiagram(drivetrain) {
  const spec = moveSpec(drivetrain);
  const grid = [];
  for (let q = -2; q <= 2; q++) for (let r = -2; r <= 2; r++) if (moveCubeDist(q, r) <= 2) grid.push({ q, r, ...movePx(q, r) });
  const base  = grid.map(h => `<polygon class="move-hex" points="${moveHexPts(h.x, h.y)}"/>`).join('');
  const reach = grid.filter(h => spec.reach(h.q, h.r)).map(h => `<polygon class="move-hex--reach" points="${moveHexPts(h.x, h.y)}"/>`).join('');

  let inner;
  if (spec.kind === 'omni') {
    // outer group slides; inner group spins in place on its own cadence
    inner = `${reach}
        <g class="move-pos">
          <g class="move-bot">
            ${moveTokenArt()}
            ${moveAnim('rotate', omniRotTimeline())}
          </g>
          ${moveAnim('translate', omniTimeline(spec.targets))}
        </g>`;
  } else {
    const tl = dirTimelines(spec.far);
    inner = `<g class="move-rot">
          ${reach}
          <g class="move-bot">
            ${moveTokenArt()}
            ${moveAnim('translate', tl.translate)}
          </g>
          ${moveAnim('rotate', tl.rotate)}
        </g>`;
  }

  return {
    svg: `<svg class="move-diagram" viewBox="-70 -70 140 140" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${base}${inner}</svg>`,
    rotate: spec.rotate, move: spec.move, reachLbl: spec.reachLbl,
  };
}

function movementCell(id) {
  const m = movementDiagram(config[id].drivetrain);
  return `
      <div class="ondeck__move">
        ${m.svg}
        <div class="ondeck__move-legend">
          <div class="ml-row"><span class="ml-k">ROTATE</span><b>${m.rotate}</b></div>
          <div class="ml-row"><span class="ml-k">MOVE</span><b>up to ${m.move} hex / AP</b></div>
          <div class="ml-row"><span class="ml-k">REACH</span><b>${m.reachLbl}</b></div>
        </div>
      </div>`;
}

function renderActive() {
  const id = state.activeBot;
  const c = config[id];
  const al = c.alliance;
  root.dataset.active = al;
  const queue = upcomingOrder(config, state);

  const stat = (lbl, val) =>
    `<div class="ondeck__stat"><span class="ondeck__stat-lbl">${lbl}</span><span class="ondeck__stat-val">${val}</span></div>`;

  els.turn.innerHTML = `
    <div class="ondeck ondeck--${al}">
      <div class="ondeck__id-block">
        <span class="ondeck__cue">ON DECK</span>
        <span class="ondeck__id">${id}</span>
        <span class="ondeck__dt">${dt(id)}</span>
      </div>
      <div class="ondeck__stats">
        ${stat('SCORE', 'L' + c.scoring)}${stat('INTAKE', 'L' + c.intake)}${stat('CLIMB', 'L' + c.climber)}
      </div>
      ${movementCell(id)}
    </div>
  `;
  els.next.innerHTML = queue.length
    ? queue.map(miniChip).join('')
    : '<span class="upnext__empty">— last up this round —</span>';
  updateControls();
}

function renderChoice(candidates) {
  root.dataset.active = '';
  els.next.innerHTML = '<span class="upnext__empty">— resolving turn —</span>';
  els.turn.innerHTML = `
    <div class="turn-choice">
      <span class="turn-choice__cue">TIE — TAP WHO PLAYS NEXT</span>
      <div class="turn-choice__opts">
        ${candidates.map(id => `<button class="turn-opt turn-opt--${config[id].alliance}" data-id="${id}" type="button">
            <span class="turn-opt__id">${id}</span><span class="turn-opt__dt">${dt(id)}</span>
          </button>`).join('')}
      </div>
    </div>
  `;
  updateControls();
  els.turn.querySelectorAll('.turn-opt').forEach(btn => {
    btn.addEventListener('click', () => {
      play('pickup');
      setActive(state, btn.dataset.id);
      renderActive();
    });
  });
}

function updateControls() {
  const haveActive = !!state.activeBot;
  for (const a of TELEOP_CONFIG.actions) {
    const btn = els.actionBtns[a.id];
    const ok = canUse(a);
    btn.classList.toggle('is-locked', !ok);
    btn.disabled = !haveActive || !ok;
    // Live lock caption: WHY it's locked, and when it opens.
    const lock = btn.querySelector('.key__lock');
    if (lock && !ok) {
      if (!actionAvailable(a, state.round)) {
        const opens = (a.rounds && a.rounds[0]) || 0;
        const inN = Math.max(0, opens - state.round);
        lock.textContent = inN > 0 ? `R${a.rounds.join('–')} · in ${inN}` : `R${a.rounds.join('–')}`;
      } else if (a.minScore) {
        lock.textContent = `NEEDS SCORE L${a.minScore}+`;
      } else {
        lock.textContent = 'LOCKED';
      }
    }
  }
  els.end.disabled = !haveActive;
  if (els.undo) els.undo.disabled = history.length === 0;
}

/** Usable now? Round window + (for HIGH placements) the on-deck bot's Score tier. */
function canUse(a) {
  if (!actionAvailable(a, state.round)) return false;
  if (a.minScore && state.activeBot && config[state.activeBot].scoring < a.minScore) return false;
  return true;
}

// ============================================================
//  TURN FLOW
// ============================================================
function resolveNext() {
  const candidates = nextCandidates(config, state);
  if (candidates.length === 1) { setActive(state, candidates[0]); renderActive(); }
  else if (candidates.length > 1) { renderChoice(candidates); }
}

function onEnd() {
  if (!state.activeBot) return;
  const roundDone = endTurn(state);
  renderRounds();

  if (!roundDone) { resolveNext(); return; }

  flourish(`ROUND ${state.round} DONE`);
  feedEntry({ label: `— ROUND ${state.round} COMPLETE —`, kind: 'round' });
  updateControls();
  setTimeout(() => {
    const more = advanceRound(state);
    if (!more) { finish(); return; }
    renderRounds();
    refreshHudCenter();
    flourish(`ROUND ${state.round}`);
    resolveNext();
  }, TELEOP_CONFIG.timing.roundFlourish);
}

// ============================================================
//  PLAY-BY-PLAY FEED + UNDO LAST
// ============================================================
function feedEntry({ alliance, botId, label, delta, kind }) {
  if (!els.feed) return;
  const ph = els.feed.querySelector('.feed__empty');
  if (ph) ph.remove();
  const e = document.createElement('div');
  e.className = `feed__item feed__item--${alliance || 'sys'}${kind ? ` feed__item--${kind}` : ''}`;
  e.innerHTML = botId
    ? `<b>${botId}</b><span class="feed__what">${label}</span><span class="feed__pts">${delta > 0 ? '+' : ''}${delta}</span>`
    : `<span class="feed__what">${label}</span>`;
  els.feed.prepend(e);
  while (els.feed.children.length > 40) els.feed.lastElementChild.remove();
}

function undoLast() {
  const last = history.pop();
  if (!last) return;
  applyScore(state, last.alliance, -last.delta);
  setScore(last.alliance, state.scores[last.alliance]);
  feedEntry({ alliance: last.alliance, botId: last.botId, label: `UNDO ${last.label}`, delta: -last.delta, kind: 'undo' });
  play('miss');
  if (els.undo) els.undo.disabled = history.length === 0;
}

// ============================================================
//  SCORING (generic over the action data)
// ============================================================
function wireAction(btn, action) {
  const fire = (delta) => {
    if (!state.activeBot || !canUse(action)) return;
    const botId = state.activeBot;
    const alliance = config[botId].alliance;
    applyScore(state, alliance, delta);
    setScore(alliance, state.scores[alliance]);           // reuse the HUD's big-number pump
    const label = action.grp && action.tier
      ? `${(GRP_TITLES[action.grp] || action.grp).toUpperCase()} ${action.tier.toUpperCase()}`
      : action.label;
    history.push({ alliance, botId, delta, label });
    feedEntry({ alliance, botId, label, delta, kind: delta < 0 ? 'undo' : 'add' });
    if (els.undo) els.undo.disabled = false;
    spawnPopup(btn, delta < 0 ? `${delta}` : `+${delta}`, delta < 0 ? 'undo' : 'add');
    pressPulse(btn, delta < 0 ? 'shake' : 'press');
    play(delta < 0 ? (action.undoSound || 'miss') : action.sound);
  };

  if (!action.undo) { btn.addEventListener('click', () => fire(action.points)); return; }

  // Long-press = subtract; quick tap = add.
  let timer = null, fired = false;
  btn.addEventListener('pointerdown', (e) => {
    if (btn.disabled) return;
    e.preventDefault();
    fired = false;
    timer = setTimeout(() => { fired = true; fire(-action.points); }, TELEOP_CONFIG.longPressMs);
  });
  btn.addEventListener('pointerup', () => {
    if (timer) { clearTimeout(timer); timer = null; }
    if (!fired && !btn.disabled) fire(action.points);
    fired = false;
  });
  const cancel = () => { if (timer) { clearTimeout(timer); timer = null; } };
  btn.addEventListener('pointerleave', cancel);
  btn.addEventListener('pointercancel', cancel);
  btn.addEventListener('contextmenu', (e) => e.preventDefault());
}

// ============================================================
//  EFFECTS
// ============================================================
function spawnPopup(btn, text, kind) {
  const pop = document.createElement('div');
  pop.className = `tele-popup tele-popup--${kind}`;
  pop.textContent = text;
  btn.appendChild(pop);
  requestAnimationFrame(() => pop.classList.add('is-firing'));
  setTimeout(() => pop.remove(), 800);
}

function pressPulse(btn, type) {
  const cls = type === 'shake' ? 'is-shake' : 'is-press';
  btn.classList.remove('is-press', 'is-shake');
  void btn.offsetWidth;
  btn.classList.add(cls);
  setTimeout(() => btn.classList.remove(cls), 400);
}

function flourish(text) {
  const f = document.createElement('div');
  f.className = 'teleop-flourish';
  f.textContent = text;
  root.appendChild(f);
  requestAnimationFrame(() => f.classList.add('is-firing'));
  setTimeout(() => f.remove(), TELEOP_CONFIG.timing.roundFlourish - 100);
}

// ============================================================
//  WINNER
// ============================================================
function finish() {
  const w = computeWinner(state);
  setTimeout(() => showWinner(w), TELEOP_CONFIG.timing.winReveal);
}

function showWinner(w) {
  play('final');
  setTimeout(() => play('countdownGo'), 420);   // victory fanfare flourish

  winnerEl = document.createElement('div');
  winnerEl.className = `teleop-winner is-${w}`;
  const headline = w === 'tie' ? 'MATCH TIED' : `${w.toUpperCase()} ALLIANCE WINS`;
  winnerEl.innerHTML = `
    <div class="teleop-winner__confetti">${Array.from({ length: 32 }).map((_, i) => `<i style="--i:${i}"></i>`).join('')}</div>
    <div class="teleop-winner__card">
      <div class="teleop-winner__headline">${headline}</div>
      <div class="teleop-winner__scores">
        <span class="teleop-winner__s teleop-winner__s--red">RED ${state.scores.red}</span>
        <span class="teleop-winner__dot">·</span>
        <span class="teleop-winner__s teleop-winner__s--blue">BLUE ${state.scores.blue}</span>
      </div>
      <button class="teleop-winner__btn" id="tele-exit" type="button">BACK TO SETUP</button>
    </div>
  `;
  root.appendChild(winnerEl);
  requestAnimationFrame(() => winnerEl.classList.add('is-active'));
  winnerEl.querySelector('#tele-exit').addEventListener('click', () => {
    resetTeleop();
    if (onExit) onExit();
  });
}
