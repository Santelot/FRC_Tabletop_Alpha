// ============================================================
//  UI · SETUP — the PIT WALL (rebuilt in v0.8)
// ============================================================
//  The setup screen is now a strategy surface, not a form:
//
//   • PROJECTED AUTO — a live expected-value engine. It reads the
//     active Challenge Card and simulates every script's math
//     (steadied rolls, intake gates, the charge-station balance
//     rule, even the Disruptor's hit to the enemy ace) and shows
//     RED vs BLUE projected auto points, updating on every change.
//   • Each bot card carries its own EV chip, a drivetrain movement
//     glyph (omni vs directional, 1 or 2 hex), and stat pips that
//     visualize Score/Intake/Climb at a glance.
//   • Every stat select shows its live BP cost, and each bot card
//     carries a BP chip (spent / budget) that flips to a warning
//     state if a manual build goes over budget. RANDOMIZE (added
//     v1.7) now only deals builds that fit the budget; DEFAULTS
//     restores the baseline loadout. All costs come from
//     balance.js → BUILD_COSTS — tune the numbers there, not here.
//
//  Contracts preserved from earlier phases (nothing upstream breaks):
//   - exports: buildSetupForm / readSetupState / showScreen
//   - every stat lives in a select[data-stat] inside .bot[data-bot]
//   - challenge switching fires `challengechange` and re-texts the
//     playbook + dropdowns via scriptCopy (v0.7 behaviour)
//  All styling is injected (styles.css untouched).
// ============================================================

import { BOT_IDS, DEFAULTS, DRIVETRAINS, SCRIPTS, ACTIVE_CHALLENGE, setActiveChallenge } from '../config.js';
import { CHALLENGE_CARDS, CHALLENGE_IDS } from '../challenges.js';
import { COMMAND_DECK } from '../style.js';
import { toast } from './toast.js';
import { RULES, BUILD_COSTS } from '../balance.js';

/**
 * Merged script copy for the ACTIVE challenge.
 * Reads ACTIVE_CHALLENGE live (it's an exported `let`), so callers
 * always get the current game's wording.
 */
function scriptFor(key) {
  const base = SCRIPTS[key] || {};
  const over = CHALLENGE_CARDS[ACTIVE_CHALLENGE]?.scriptCopy?.[key] || {};
  return { ...base, ...over };
}

// ============================================================
//  BUILD COSTS — Pit Wall point-buy (added v1.7)
// ============================================================
//  The only two functions that ever read BUILD_COSTS. Every cost
//  shown anywhere in the Pit Wall (option labels, the BP chip,
//  RANDOMIZE) goes through these, so there's exactly one place
//  the table itself lives: balance.js.
// ============================================================

/** BP cost of a single stat value (a drivetrain key, or a scoring/intake/climber level). */
function costFor(stat, val) {
  const table = BUILD_COSTS[stat];
  return table ? (table[val] ?? 0) : 0;
}

/** Total BP cost of a full build: { drivetrain, scoring, intake, climber }. */
function buildCost(vals) {
  return costFor('drivetrain', vals.drivetrain)
       + costFor('scoring',    vals.scoring)
       + costFor('intake',     vals.intake)
       + costFor('climber',    vals.climber);
}

export function buildSetupForm() {
  injectPitwallStyles();
  buildChallengeSelector();
  buildProjectionBar();
  buildAutonPlaybook();
  BOT_IDS.forEach(buildBotConfig);
  applyPitStage();
  wireRecalc();
  updateChallengeLabels(ACTIVE_CHALLENGE);
}

// ============================================================
//  COMMAND DECK — the v0.9 layout pass
// ============================================================
//  Restructures the setup screen at runtime (index.html untouched):
//
//    1  CHALLENGE          ← pick the game
//    2  PROJECTED AUTO     ← the strategy readout
//    3  RED ALLIANCE  |  BLUE ALLIANCE   ← facing off, side by side
//    5  RUN / RESET        ← the action row
//    6  AUTON PLAYBOOK     ← demoted to a collapsed reference
//
//  It finds your existing alliance containers by walking up from the
//  bot cards, so it adapts to whatever index.html actually has. If
//  anything looks off, COMMAND_DECK.enabled = false restores the
//  original single-column flow exactly.

function applyPitStage() {
  if (!COMMAND_DECK.enabled) return;
  const setup = document.querySelector('.setup');
  if (!setup || setup.classList.contains('pitstage')) return;

  // Walk up from a bot card to the element that is a DIRECT child of .setup.
  const topAncestor = (el) => {
    if (!el) return null;
    let n = el;
    while (n.parentElement && n.parentElement !== setup) n = n.parentElement;
    return n.parentElement === setup ? n : null;
  };

  const redBox  = topAncestor(document.querySelector('.bot[data-bot="R1"]'));
  const blueBox = topAncestor(document.querySelector('.bot[data-bot="B1"]'));
  if (!redBox || !blueBox || redBox === blueBox) return;   // unexpected shape → leave layout alone

  setup.classList.add('pitstage');
  setup.dataset.side = 'red';
  redBox.classList.add('stage-pane', 'stage-pane--red');
  blueBox.classList.add('stage-pane', 'stage-pane--blue');
  document.querySelector('.setup__actions')?.classList.add('stage-actions');

  // The bot rows go HORIZONTAL — one alliance on stage at a time.
  for (const box of [redBox, blueBox]) {
    const bot = box.querySelector('.bot');
    if (bot) (bot.parentElement === box ? box : bot.parentElement).classList.add('stage-botrow');
  }

  // Tab rail — switch alliances; the off-stage tab carries a live brief.
  const rail = document.createElement('div');
  rail.className = 'stage-rail';
  rail.innerHTML = `
    <button type="button" class="stage-tab stage-tab--red is-on" data-side="red">
      <span class="stage-tab__top">
        <span class="stage-tab__name">RED ALLIANCE</span>
        <span class="cmdk-evchip cmdk-evchip--red">PROJECTED <b id="ev-ally-red">+0.0</b></span>
      </span>
      <span class="stage-tab__brief" id="brief-red"></span>
    </button>
    <button type="button" class="stage-tab stage-tab--blue" data-side="blue">
      <span class="stage-tab__top">
        <span class="stage-tab__name">BLUE ALLIANCE</span>
        <span class="cmdk-evchip cmdk-evchip--blue">PROJECTED <b id="ev-ally-blue">+0.0</b></span>
      </span>
      <span class="stage-tab__brief" id="brief-blue"></span>
    </button>`;
  setup.insertBefore(rail, redBox);

  // The stage: both panes live here; only one is on.
  const wrap = document.createElement('div');
  wrap.className = 'stage-wrap';
  setup.insertBefore(wrap, redBox);
  wrap.appendChild(redBox);
  wrap.appendChild(blueBox);

  rail.querySelectorAll('.stage-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      setup.dataset.side = tab.dataset.side;
      rail.querySelectorAll('.stage-tab').forEach(t =>
        t.classList.toggle('is-on', t === tab));
    });
  });

  // The big playbook panel retires — script briefings arrive as toasts now.
  document.getElementById('auton-playbook')?.classList.add('is-killed');
}

/** Live one-line summaries of each alliance, shown on its (off-stage) tab. */
function renderBriefs() {
  const sides = { red: '', blue: '' };
  BOT_IDS.forEach(id => {
    const el = document.querySelector(`.bot[data-bot="${id}"]`);
    if (!el) return;
    const dtTxt = el.querySelector('[data-stat="drivetrain"] option:checked')?.textContent?.trim() || '';
    const dtAb = dtTxt === 'West Coast' ? 'WC' : dtTxt.slice(0, 3).toUpperCase();
    const sc = el.querySelector('[data-stat="script"]')?.value;
    const scLabel = sc ? scriptFor(sc).label : '';
    sides[id[0] === 'R' ? 'red' : 'blue'] +=
      `<i><b>${id}</b> ${dtAb} · ${scLabel}</i>`;
  });
  const br = document.getElementById('brief-red');
  const bb = document.getElementById('brief-blue');
  if (br) br.innerHTML = sides.red;
  if (bb) bb.innerHTML = sides.blue;
}

function injectCmdkStyles() {
  if (document.getElementById('cmdk-styles')) return;
  const s = document.createElement('style');
  s.id = 'cmdk-styles';
  s.textContent = `
    .setup.cmdk { display: grid !important; grid-template-columns: 1fr 1fr;
      gap: clamp(14px, 1.6vw, 22px); align-items: start; }
    .setup.cmdk > * { grid-column: 1 / -1; min-width: 0; }
    .setup.cmdk > #challenge-select { order: 1; margin: 0; }
    .setup.cmdk > #ev-bar           { order: 2; margin: 0; }
    .setup.cmdk > .cmdk-ally--red   { order: 3; grid-column: 1; }
    .setup.cmdk > .cmdk-ally--blue  { order: 4; grid-column: 2; }
    .setup.cmdk > .cmdk-actions     { order: 5; margin: 0; }
    .setup.cmdk > #auton-playbook   { order: 6; }
    @media (max-width: ${COMMAND_DECK.breakpoint}px) {
      .setup.cmdk { grid-template-columns: 1fr; }
      .setup.cmdk > .cmdk-ally--red, .setup.cmdk > .cmdk-ally--blue { grid-column: 1; }
    }

    .cmdk-ally { position: relative; }
    .setup.cmdk .cmdk-botlist { display: flex !important; flex-direction: column;
      gap: clamp(10px, 1.2vw, 16px); }
    .setup.cmdk .cmdk-botlist .bot { width: 100%; }

    .cmdk-evchip { position: absolute; top: clamp(12px, 1.6vw, 22px); right: clamp(12px, 1.6vw, 22px);
      z-index: 2; padding: 8px 12px; border-radius: 10px;
      font: 700 10px/1 'JetBrains Mono', monospace; letter-spacing: .14em;
      color: var(--txt-soft, #9aa0b4); background: rgba(10, 11, 17, .6);
      border: 1px solid var(--line, rgba(255,247,228,.18)); backdrop-filter: blur(2px); }
    .cmdk-evchip b { font-size: 15px; margin-left: 6px; font-family: 'Bowlby One', sans-serif;
      font-weight: 400; letter-spacing: 0; }
    .cmdk-evchip--red  b { color: var(--red,  #e63946); }
    .cmdk-evchip--blue b { color: var(--blue, #1e88e5); }
  `;
  document.head.appendChild(s);
}

// ============================================================
//  CHALLENGE SELECTOR — pick the game; updates labels + active challenge
// ============================================================
function buildChallengeSelector() {
  if (document.getElementById('challenge-select')) return;
  const host = document.querySelector('.setup');
  if (!host) return;

  const kindOf = { shooter: 'Shooting', manipulator: 'Manipulation' };
  const opts = CHALLENGE_IDS.map(id => {
    const c = CHALLENGE_CARDS[id];
    const on = id === ACTIVE_CHALLENGE ? ' is-on' : '';
    return `<button type="button" class="chalsel__opt${on}" data-ch="${id}">
        <span class="chalsel__name">${c.label}</span>
        <span class="chalsel__kind">${kindOf[c.scoringModel] || ''}</span>
      </button>`;
  }).join('');

  const section = document.createElement('section');
  section.className = 'chalsel';
  section.id = 'challenge-select';
  section.innerHTML = `
    <div class="chalsel__label">CHALLENGE</div>
    <div class="chalsel__opts">${opts}</div>
  `;
  host.insertBefore(section, host.firstChild);

  section.querySelectorAll('.chalsel__opt').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.ch;
      if (id === ACTIVE_CHALLENGE) return;
      setActiveChallenge(id);
      section.querySelectorAll('.chalsel__opt').forEach(b => b.classList.toggle('is-on', b === btn));
      updateChallengeLabels(id);
      // Tell the match layer the field/sim must be rebuilt for the new game.
      window.dispatchEvent(new CustomEvent('challengechange', { detail: id }));
    });
  });
}

function updateChallengeLabels(id) {
  const label = CHALLENGE_CARDS[id]?.label || 'Rapid React';
  const up = label.toUpperCase();
  const set = (sel, txt) => { const el = document.querySelector(sel); if (el) el.textContent = txt; };
  set('.topbar__sub', `${label} · Match setup`);
  set('.match-topbar__title', `${up} · PRACTICE MATCH`);
  set('.match-hud__match-name', up);
  refreshScriptCopy();
  recalcProjection();
}

/**
 * Re-text the playbook cards + every bot's Auton dropdown for the
 * active challenge. Pure DOM text updates — selections are preserved.
 */
function refreshScriptCopy() {
  // Playbook cards
  document.querySelectorAll('#auton-playbook .pb-card').forEach(cardEl => {
    const s = scriptFor(cardEl.dataset.key);
    const put = (sel, txt) => { const el = cardEl.querySelector(sel); if (el) el.textContent = txt; };
    put('.pb-card__name', s.label);
    put('.pb-card__detail', s.detail || s.desc || '');
    put('.pb-card__v', s.scores || '—');
    put('.pb-card__tip', s.tip || '');
  });

  // Bot Auton selects: option labels + the live description line
  document.querySelectorAll('.bot [data-stat="script"]').forEach(sel => {
    [...sel.options].forEach(opt => { opt.textContent = scriptFor(opt.value).label; });
    const desc = sel.closest('.pw-script')?.querySelector('.pw-script__desc');
    if (desc) desc.textContent = scriptFor(sel.value).desc;
  });
}

// ============================================================
//  PROJECTED AUTO — the live expected-value engine
// ============================================================
//  Simulates the active card's auton math from the current form:
//   shooter: steadied/base shot EV per script, taxi, jam vs the ace
//   placement: preload + second-cycle EV, mobility, the charge
//              balance rule (1 solo L3 engages center; 2+ engage),
//              jam = one tier down + steadied lost on the first place
//  It's an EXPECTATION — the dice still get their say.

function projectAuto(bots) {
  const card = CHALLENGE_CARDS[ACTIVE_CHALLENGE];
  const list = Object.values(bots);
  const acc = card.scoring.accuracy, std = card.scoring.steadied;
  const ev = {};
  const total = { red: 0, blue: 0 };
  const add = (b, n) => { ev[b.id] = (ev[b.id] || 0) + n; total[b.alliance] += n; };
  list.forEach(b => { ev[b.id] = 0; });

  // Disruptors flag the enemy's best placer/shooter.
  const jammed = new Set();
  for (const d of list.filter(b => b.script === 'disruptor')) {
    const foes = list.filter(b => b.alliance !== d.alliance &&
      (b.script === 'quick_score' || b.script === 'triple_threat'));
    if (foes.length) {
      foes.sort((a, b) => b.scoring - a.scoring);
      jammed.add(foes[0].id);
    }
  }

  if (card.scoring.kind === 'shoot') {
    const HIT = card.scoring.points.hit;
    const jamAcc = sc => { const t = sc - 2; return t >= 1 ? acc[t] : 0; };  // DISRUPT_TIER_DROP=2; below L1 = jammed cold
    for (const b of list) {
      if (b.script === 'cross_park') add(b, (RULES.mobilityEnabled ? card.mobility.points : 0));
      else if (b.script === 'quick_score')
        add(b, (jammed.has(b.id) ? jamAcc(b.scoring) : std[b.scoring]) / 100 * HIT);
      else if (b.script === 'triple_threat') {
        const shots = b.intake >= 2 ? 2 : 1;
        add(b, shots * (jammed.has(b.id) ? jamAcc(b.scoring) : acc[b.scoring]) / 100 * HIT);
      }
    }
  } else {
    const pts = sc => sc >= card.scoring.highMinScore
      ? card.scoring.points.high : card.scoring.points.mid;
    const cap = card.endgame.capability;
    const canClimb = b => cap[b.climber] && cap[b.climber] !== 'none';
    const climbPool = { red: [], blue: [] };
    const jamAcc = sc => acc[Math.max(1, sc - 1)];   // CU jam: one tier down, steadied lost
    for (const b of list) {
      if (b.script === 'quick_score') {
        add(b, (jammed.has(b.id) ? jamAcc(b.scoring) : std[b.scoring]) / 100 * pts(b.scoring));
        add(b, (RULES.mobilityEnabled ? card.mobility.points : 0));
      } else if (b.script === 'triple_threat') {
        add(b, (jammed.has(b.id) ? jamAcc(b.scoring) : acc[b.scoring]) / 100 * pts(b.scoring));
        if (b.intake >= 2) add(b, acc[b.scoring] / 100 * pts(b.scoring));
        if (canClimb(b)) climbPool[b.alliance].push(b);
        else if (b.intake < 2) add(b, (RULES.mobilityEnabled ? card.mobility.points : 0));
      } else if (b.script === 'cross_park') {
        if (canClimb(b)) climbPool[b.alliance].push(b);
        else add(b, (RULES.mobilityEnabled ? card.mobility.points : 0));
      }
    }
    for (const al of ['red', 'blue']) {
      const c = climbPool[al];
      if (!c.length) continue;
      const dock = card.endgame.points.dock.auto, eng = card.endgame.points.engage.auto;
      if (c.length === 1) add(c[0], cap[c[0].climber] === 'any' ? eng : dock);
      else c.forEach(b => add(b, eng));
    }
  }
  return { perBot: ev, total };
}

function buildProjectionBar() {
  if (document.getElementById('ev-bar')) return;
  const host = document.querySelector('.setup');
  const after = document.getElementById('challenge-select');
  if (!host) return;

  const section = document.createElement('section');
  section.className = 'evbar';
  section.id = 'ev-bar';
  section.innerHTML = `
    <div class="evbar__side evbar__side--red">
      <span class="evbar__num" id="ev-red">0.0</span>
    </div>
    <div class="evbar__mid">
      <span class="evbar__title">PROJECTED AUTO</span>
      <div class="evbar__track"><div class="evbar__fill" id="ev-fill"></div></div>
      <span class="evbar__hint">expected points · dice still decide</span>
    </div>
    <div class="evbar__side evbar__side--blue">
      <span class="evbar__num" id="ev-blue">0.0</span>
    </div>
    <div class="evbar__quick">
      <button type="button" class="evbar__btn" id="pw-randomize" title="Deal a random scrimmage">⟳ RANDOMIZE</button>
      <button type="button" class="evbar__btn" id="pw-defaults" title="Restore the baseline loadout">DEFAULTS</button>
    </div>
  `;
  if (after && after.nextSibling) host.insertBefore(section, after.nextSibling);
  else host.insertBefore(section, host.firstChild);

  section.querySelector('#pw-randomize').addEventListener('click', randomizeLoadout);
  section.querySelector('#pw-defaults').addEventListener('click', restoreDefaults);
}

function recalcProjection() {
  const bar = document.getElementById('ev-bar');
  if (!bar || !document.querySelector('.bot [data-stat="drivetrain"]')) return;
  const bots = readSetupState();
  const { perBot, total } = projectAuto(bots);

  const r = total.red, b = total.blue;
  const redEl = document.getElementById('ev-red');
  const blueEl = document.getElementById('ev-blue');
  if (redEl)  redEl.textContent  = r.toFixed(1);
  if (blueEl) blueEl.textContent = b.toFixed(1);
  const fill = document.getElementById('ev-fill');
  if (fill) fill.style.width = `${(r + b) > 0 ? (r / (r + b)) * 100 : 50}%`;
  bar.classList.toggle('is-red-lead',  r > b + 0.05);
  bar.classList.toggle('is-blue-lead', b > r + 0.05);

  BOT_IDS.forEach(id => {
    const chip = document.querySelector(`.bot[data-bot="${id}"] .pw-ev b`);
    if (chip) chip.textContent = `+${(perBot[id] || 0).toFixed(1)}`;
  });
  const ar = document.getElementById('ev-ally-red');
  const ab = document.getElementById('ev-ally-blue');
  if (ar) ar.textContent = `+${r.toFixed(1)}`;
  if (ab) ab.textContent = `+${b.toFixed(1)}`;

  renderBriefs();
  recalcBudgets();
}

/**
 * Live BP-spent readout on each bot card (Pit Wall point-buy, v1.7).
 * Reads BUILD_COSTS via buildCost() — nothing here is a number,
 * it's all pulled from balance.js.
 */
function recalcBudgets() {
  const bots = readSetupState();
  BOT_IDS.forEach(id => {
    const b = bots[id];
    const chip = document.querySelector(`.bot[data-bot="${id}"] .pw-bp`);
    if (!b || !chip) return;
    const spent = buildCost(b);
    const spentEl = chip.querySelector('.pw-bp__spent');
    if (spentEl) spentEl.textContent = spent;
    chip.classList.toggle('is-over', spent > BUILD_COSTS.budget);
    chip.title = spent > BUILD_COSTS.budget
      ? `Over budget: ${spent} / ${BUILD_COSTS.budget} BP`
      : `Build Points spent / budget`;
  });
}

/** One delegated listener: any select change anywhere in setup → repaint. */
function wireRecalc() {
  const host = document.querySelector('.setup');
  if (!host || host.dataset.pwWired) return;
  host.dataset.pwWired = '1';
  host.addEventListener('change', (e) => {
    const sel = e.target.closest('select[data-stat]');
    if (!sel) return;
    const botEl = sel.closest('.bot');
    if (botEl) {
      if (sel.dataset.stat === 'drivetrain') paintGlyph(botEl, sel.value);
      else if (sel.dataset.stat !== 'script') paintPips(sel);
    }
    recalcProjection();
  });
}

// ============================================================
//  QUICK ACTIONS
// ============================================================
const pick = arr => arr[Math.floor(Math.random() * arr.length)];

/**
 * A random build that never exceeds the BP budget (balance.js →
 * BUILD_COSTS.budget). Rejection-samples from the same mid-weighted
 * distribution RANDOMIZE always used, so the "feel" of a scrimmage
 * roll is unchanged — it just keeps re-rolling until the total is
 * legal. Falls back to the cheapest legal minimum (mandatory
 * Drivetrain + Scoring L1 + Intake L1, no Climber) if 300 tries
 * somehow all miss, which shouldn't happen at any cost table we've
 * tuned so far.
 */
function randomLegalBuild(budget) {
  const dtKeys = Object.keys(DRIVETRAINS);

  for (let attempt = 0; attempt < 300; attempt++) {
    const vals = {
      drivetrain: pick(dtKeys),
      scoring:    pick([1, 2, 2, 3]),        // mid-weighted
      intake:     pick([1, 2, 2, 3]),
      climber:    pick([0, 0, 1, 2, 2, 3]),
    };
    if (buildCost(vals) <= budget) return vals;
  }

  const cheapestDt = dtKeys.reduce((a, b) =>
    costFor('drivetrain', a) <= costFor('drivetrain', b) ? a : b);
  return { drivetrain: cheapestDt, scoring: 1, intake: 1, climber: 0 };
}

function randomizeLoadout() {
  const scripts = Object.keys(SCRIPTS);
  BOT_IDS.forEach(id => {
    setBotValues(id, { ...randomLegalBuild(BUILD_COSTS.budget), script: pick(scripts) });
  });
  refreshScriptCopy();
  recalcProjection();
}

function restoreDefaults() {
  BOT_IDS.forEach(id => setBotValues(id, DEFAULTS[id]));
  refreshScriptCopy();
  recalcProjection();
}

function setBotValues(botId, vals) {
  const el = document.querySelector(`.bot[data-bot="${botId}"]`);
  if (!el) return;
  for (const [stat, v] of Object.entries(vals)) {
    const sel = el.querySelector(`[data-stat="${stat}"]`);
    if (!sel) continue;
    sel.value = String(v);
    if (stat === 'drivetrain') paintGlyph(el, sel.value);
    else if (stat === 'script') {
      const desc = el.querySelector('.pw-script__desc');
      if (desc) desc.textContent = scriptFor(sel.value).desc;
    } else paintPips(sel);
  }
}

// ============================================================
//  AUTON PLAYBOOK (unchanged behaviour from v0.7)
// ============================================================
function buildAutonPlaybook() {
  if (document.getElementById('auton-playbook')) return;
  const host = document.querySelector('.setup');
  if (!host) return;

  const cards = Object.keys(SCRIPTS).map(key => {
    const s = scriptFor(key);
    return `
    <div class="pb-card pb-card--${key}" data-key="${key}">
      <div class="pb-card__name">${s.label}</div>
      <div class="pb-card__detail">${s.detail || s.desc}</div>
      <div class="pb-card__row">
        <span class="pb-card__k">SCORES</span>
        <span class="pb-card__v">${s.scores || '—'}</span>
      </div>
      <div class="pb-card__tip">${s.tip || ''}</div>
    </div>
  `;
  }).join('');

  const section = document.createElement('section');
  section.className = COMMAND_DECK.enabled ? 'playbook' : 'playbook is-open';
  section.id = 'auton-playbook';
  section.innerHTML = `
    <button class="playbook__toggle" type="button" id="playbook-toggle">
      <span class="playbook__title">AUTON PLAYBOOK</span>
      <span class="playbook__hint">what each auton does</span>
      <span class="playbook__chev">▾</span>
    </button>
    <div class="playbook__grid">${cards}</div>
  `;
  host.insertBefore(section, host.firstChild);

  section.querySelector('#playbook-toggle')
    .addEventListener('click', () => section.classList.toggle('is-open'));
}

// ============================================================
//  BOT CARDS — drivetrain glyph, stat pips, EV chip, BP chip
// ============================================================

//  Board-game movement identity (the 2×2 speed/steering grid).
const DT_MOVE = {
  swerve:     { omni: true,  speed: 2 },
  mecanum:    { omni: true,  speed: 1 },
  west_coast: { omni: false, speed: 2 },
  tank:       { omni: false, speed: 1 },
};

/** Tiny static SVG: hexagon + spokes (omni = 6, directional = 2 + turn arc). */
function dtGlyph(key) {
  const m = DT_MOVE[key] || { omni: false, speed: 1 };
  const C = 30, CY = 23, R = 9;
  const hexPts = [];
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 3 * i + Math.PI / 6;
    hexPts.push(`${(C + R * Math.cos(a)).toFixed(1)},${(CY + R * Math.sin(a)).toFixed(1)}`);
  }
  const col = m.omni ? '#5ad1ff' : '#ffd23f';
  const spoke = (a) => {
    const x1 = C + (R + 3) * Math.cos(a), y1 = CY + (R + 3) * Math.sin(a);
    const L = m.speed === 2 ? 10 : 6;
    const x2 = C + (R + 3 + L) * Math.cos(a), y2 = CY + (R + 3 + L) * Math.sin(a);
    return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"
      stroke="${col}" stroke-width="2.4" stroke-linecap="round" marker-end="url(#pwArr${key})"/>`;
  };
  const angles = m.omni
    ? [0, 1, 2, 3, 4, 5].map(i => Math.PI / 3 * i)
    : [0, Math.PI];
  const arc = m.omni ? '' :
    `<path d="M ${C - 7} ${CY - R - 6} A 8 8 0 0 1 ${C + 7} ${CY - R - 6}" fill="none"
       stroke="${col}" stroke-width="1.8" stroke-dasharray="2.5 2.5" opacity="0.85"/>`;
  return `
    <svg class="pw-glyph__svg" viewBox="0 0 60 46" aria-hidden="true">
      <defs><marker id="pwArr${key}" markerWidth="5" markerHeight="5" refX="3.6" refY="2.5" orient="auto">
        <path d="M0,0 L5,2.5 L0,5 Z" fill="${col}"/></marker></defs>
      <polygon points="${hexPts.join(' ')}" fill="none" stroke="${col}" stroke-width="2" opacity="0.9"/>
      ${angles.map(spoke).join('')}
      ${arc}
      <text x="${C}" y="${CY + 3.5}" text-anchor="middle" font-size="9" font-weight="800"
        font-family="'JetBrains Mono',monospace" fill="${col}">${m.speed}</text>
    </svg>`;
}

function paintGlyph(botEl, dtKey) {
  const g = botEl.querySelector('.pw-glyph');
  if (g) g.innerHTML = dtGlyph(dtKey);
}

function paintPips(sel) {
  const pips = sel.closest('.pw-stat')?.querySelector('.pw-pips');
  if (!pips) return;
  const v = +sel.value;
  [...pips.children].forEach((p, i) => p.classList.toggle('is-on', i < v));
}

function buildBotConfig(botId) {
  const def = DEFAULTS[botId];
  const el = document.querySelector(`.bot[data-bot="${botId}"]`);
  if (!el) return;
  const alliance = botId[0] === 'R' ? 'red' : 'blue';
  el.classList.add('pw-bot', `pw-bot--${alliance}`);

  const statField = (label, stat, levels, val) => `
    <div class="pw-stat">
      <label class="pw-stat__lbl">${label}</label>
      <select data-stat="${stat}">
        ${levels.map(t => `<option value="${t}" ${t === val ? 'selected' : ''}>L${t} · ${costFor(stat, t)} BP</option>`).join('')}
      </select>
      <div class="pw-pips">${levels.filter(t => t > 0).map(t =>
        `<span class="${t <= val ? 'is-on' : ''}"></span>`).join('')}</div>
    </div>`;

  el.innerHTML = `
    <div class="pw-head">
      <span class="pw-id">${botId}</span>
      <span class="pw-glyph">${dtGlyph(def.drivetrain)}</span>
      <select data-stat="drivetrain" class="pw-dt">
        ${Object.entries(DRIVETRAINS).map(([k, v]) =>
          `<option value="${k}" ${k === def.drivetrain ? 'selected' : ''}>${v.label} · ${costFor('drivetrain', k)} BP</option>`
        ).join('')}
      </select>
      <span class="pw-bp" title="Build Points spent / budget">BP <b class="pw-bp__spent">${buildCost(def)}</b>/<b>${BUILD_COSTS.budget}</b></span>
      <span class="pw-ev" title="Projected auto points for this bot">EV <b>+0.0</b></span>
    </div>
    <div class="pw-stats">
      ${statField('SCORE',  'scoring', [1, 2, 3],    def.scoring)}
      ${statField('INTAKE', 'intake',  [1, 2, 3],    def.intake)}
      ${statField('CLIMB',  'climber', [0, 1, 2, 3], def.climber)}
    </div>
    <div class="pw-script">
      <label class="pw-stat__lbl">AUTON</label>
      <select data-stat="script">
        ${Object.keys(SCRIPTS).map(k =>
          `<option value="${k}" ${k === def.script ? 'selected' : ''}>${scriptFor(k).label}</option>`
        ).join('')}
      </select>
      <div class="pw-script__desc">${scriptFor(def.script).desc}</div>
    </div>
  `;

  // Live description update (reads scriptFor at change-time, so it always
  // reflects the active challenge's wording)
  const scriptSelect = el.querySelector('[data-stat="script"]');
  const descEl = el.querySelector('.pw-script__desc');
  scriptSelect.addEventListener('change', () => {
    const sc = scriptFor(scriptSelect.value);
    descEl.textContent = sc.desc;
    toast({
      title: `${botId} · ${sc.label}`,
      body: `${sc.desc}${sc.scores ? `<span class="toast__scores">${sc.scores}</span>` : ''}${sc.tip ? `<span class="toast__tip">${sc.tip}</span>` : ''}`,
      tone: alliance,
      ms: 6500,
    });
  });
}

export function readSetupState() {
  const bots = {};
  BOT_IDS.forEach(id => {
    const el = document.querySelector(`.bot[data-bot="${id}"]`);
    bots[id] = {
      id,
      alliance:    id[0] === 'R' ? 'red' : 'blue',
      drivetrain:  el.querySelector('[data-stat="drivetrain"]').value,
      scoring:     +el.querySelector('[data-stat="scoring"]').value,
      intake:      +el.querySelector('[data-stat="intake"]').value,
      climber:     +el.querySelector('[data-stat="climber"]').value,
      script:      el.querySelector('[data-stat="script"]').value,
    };
  });
  return bots;
}

export function showScreen(name) {
  document.getElementById('screen-home')?.classList.toggle('is-active', name === 'home');
  document.getElementById('screen-setup').classList.toggle('is-active', name === 'setup');
  document.getElementById('screen-match').classList.toggle('is-active', name === 'match');
  // Notify any listeners (e.g. Three.js needs to resize after the canvas becomes visible)
  window.dispatchEvent(new Event('resize'));
}

// ============================================================
//  INJECTED STYLES — challenge selector (v0.5) + Pit Wall (v0.8)
// ============================================================
function injectPitwallStyles() {
  if (document.getElementById('pitwall-styles')) return;
  const s = document.createElement('style');
  s.id = 'pitwall-styles';
  s.textContent = `
    /* ---- challenge selector (carried over) ---- */
    .chalsel { margin: 0 0 14px; }
    .chalsel__label { font: 700 11px/1 'JetBrains Mono', monospace; letter-spacing:.18em;
      color: var(--txt-soft,#9aa0b4); margin-bottom:8px; }
    .chalsel__opts { display:flex; gap:10px; }
    .chalsel__opt { flex:1; display:flex; flex-direction:column; gap:4px; align-items:flex-start;
      padding:12px 14px; border-radius:12px; cursor:pointer; text-align:left;
      background: var(--panel,#11121b); border:1.5px solid var(--line,rgba(255,247,228,.14));
      color: var(--bg,#FFF7E4); transition: border-color .15s, background .15s, transform .08s; }
    .chalsel__opt:hover { border-color: rgba(255,210,63,.5); }
    .chalsel__opt:active { transform: translateY(1px); }
    .chalsel__opt.is-on { border-color: var(--gold,#ffd23f); background: rgba(255,210,63,.10);
      box-shadow: 0 0 0 1px var(--gold,#ffd23f) inset; }
    .chalsel__name { font:800 16px/1 'Bowlby One','Outfit',sans-serif; letter-spacing:.01em; }
    .chalsel__kind { font:600 11px/1 'JetBrains Mono',monospace; letter-spacing:.1em;
      color:var(--txt-soft,#9aa0b4); text-transform:uppercase; }

    /* ---- PROJECTED AUTO bar ---- */
    .evbar {
      display:grid; grid-template-columns:auto 1fr auto auto; align-items:center;
      gap: clamp(10px,1.6vw,20px); margin: 0 0 14px; padding: 12px clamp(14px,1.8vw,22px);
      background: linear-gradient(180deg, rgba(255,210,63,.07), rgba(17,18,27,.6));
      border: 2px solid var(--line, rgba(255,247,228,.14)); border-radius: 16px;
    }
    .evbar__num { font-family:'Bowlby One',sans-serif; font-size: clamp(24px,2.6vw,32px); line-height:1;
      transition: text-shadow .2s; }
    .evbar__side--red  .evbar__num { color: var(--red,#e63946); }
    .evbar__side--blue .evbar__num { color: var(--blue,#1e88e5); }
    .evbar.is-red-lead  .evbar__side--red  .evbar__num { text-shadow: 0 0 18px rgba(230,57,70,.65); }
    .evbar.is-blue-lead .evbar__side--blue .evbar__num { text-shadow: 0 0 18px rgba(30,136,229,.65); }
    .evbar__mid { display:flex; flex-direction:column; gap:5px; min-width: 0; }
    .evbar__title { font:800 12px/1 'JetBrains Mono',monospace; letter-spacing:.22em; color: var(--gold,#ffd23f); }
    .evbar__hint  { font:600 10px/1 'JetBrains Mono',monospace; letter-spacing:.1em; color: var(--txt-soft,#9aa0b4); }
    .evbar__track { height:8px; border-radius:99px; overflow:hidden;
      background: linear-gradient(90deg, rgba(230,57,70,.18), rgba(30,136,229,.18));
      border:1px solid var(--line, rgba(255,247,228,.14)); position:relative; }
    .evbar__fill  { height:100%; width:50%;
      background: linear-gradient(90deg, var(--red,#e63946), #b8412f);
      border-right: 2px solid var(--gold,#ffd23f);
      box-shadow: 4px 0 14px rgba(255,210,63,.5);
      transition: width .35s cubic-bezier(.2,.9,.3,1); }
    .evbar__quick { display:flex; flex-direction:column; gap:6px; }
    .evbar__btn { padding:8px 12px; border-radius:8px; cursor:pointer;
      background: rgba(255,247,228,.06); border:1.5px solid var(--line,rgba(255,247,228,.2));
      color: var(--bg,#FFF7E4); font:700 10px/1 'JetBrains Mono',monospace; letter-spacing:.12em;
      transition: border-color .15s, background .15s, transform .08s; }
    .evbar__btn:hover { border-color: var(--gold,#ffd23f); background: rgba(255,210,63,.1); }
    .evbar__btn:active { transform: translateY(1px); }

    /* ---- bot cards: PIT WALL skin ---- */
    .setup .bot.pw-bot {
      background: var(--panel,#11121b);
      border: 2px solid var(--line,rgba(255,247,228,.14));
      border-radius: 16px; padding: clamp(12px,1.4vw,16px);
      display: flex; flex-direction: column; gap: 10px;
      position: relative; overflow: hidden;
    }
    .pw-bot::before { content:''; position:absolute; inset:0 auto 0 0; width:5px; }
    .pw-bot--red::before  { background: linear-gradient(180deg, var(--red,#e63946), transparent); }
    .pw-bot--blue::before { background: linear-gradient(180deg, var(--blue,#1e88e5), transparent); }
    .pw-bot--red:hover  { border-color: rgba(230,57,70,.55); }
    .pw-bot--blue:hover { border-color: rgba(30,136,229,.55); }

    .pw-head { display:flex; align-items:center; gap:10px; flex-wrap: wrap; }
    .pw-id { font-family:'Bowlby One',sans-serif; font-size: clamp(18px,1.9vw,22px); color:#fff; }
    .pw-bot--red  .pw-id { text-shadow: 0 0 14px rgba(230,57,70,.5); }
    .pw-bot--blue .pw-id { text-shadow: 0 0 14px rgba(30,136,229,.5); }
    .pw-glyph { width:54px; height:42px; flex:0 0 auto; display:flex; }
    .pw-glyph__svg { width:100%; height:100%; }
    .pw-dt { flex:1; min-width:0; }
    .pw-ev { font:700 10px/1 'JetBrains Mono',monospace; letter-spacing:.08em;
      color: var(--txt-soft,#9aa0b4); white-space:nowrap;
      padding:6px 8px; border-radius:8px; background: rgba(255,210,63,.08);
      border:1px solid rgba(255,210,63,.25); }
    .pw-ev b { color: var(--gold,#ffd23f); font-size:12px; margin-left:3px; }

    /* ---- BP chip (added v1.7) — mirrors .pw-ev, warns red when over budget ---- */
    .pw-bp { font:700 10px/1 'JetBrains Mono',monospace; letter-spacing:.08em;
      color: var(--txt-soft,#9aa0b4); white-space:nowrap;
      padding:6px 8px; border-radius:8px; background: rgba(255,210,63,.08);
      border:1px solid rgba(255,210,63,.25); transition: background .15s, border-color .15s; }
    .pw-bp b { color: var(--gold,#ffd23f); font-size:12px; }
    .pw-bp.is-over { background: rgba(230,57,70,.14); border-color: rgba(230,57,70,.55); }
    .pw-bp.is-over b { color: var(--red,#e63946); }

    .pw-stats { display:grid; grid-template-columns: repeat(3, 1fr); gap:8px; }
    .pw-stat { display:flex; flex-direction:column; gap:5px; }
    .pw-stat__lbl { font:700 9px/1 'JetBrains Mono',monospace; letter-spacing:.18em;
      color: var(--txt-soft,#9aa0b4); }
    .pw-pips { display:flex; gap:3px; }
    .pw-pips span { flex:1; height:4px; border-radius:99px; background: rgba(255,247,228,.12);
      transition: background .15s, box-shadow .15s; }
    .pw-pips span.is-on { background: var(--gold,#ffd23f); box-shadow: 0 0 7px rgba(255,210,63,.55); }

    .pw-bot select {
      width:100%; padding:8px 10px; border-radius:8px; cursor:pointer;
      background: rgba(255,247,228,.06); border:1.5px solid var(--line,rgba(255,247,228,.2));
      color: var(--bg,#FFF7E4); font:600 12px/1.1 'JetBrains Mono',monospace;
      appearance:auto;
    }
    .pw-bot select:focus { outline:none; border-color: var(--gold,#ffd23f); }
    .pw-bot select option { background:#161721; color:var(--bg,#FFF7E4); }

    .pw-script { display:flex; flex-direction:column; gap:5px; }
    .pw-script__desc { font:italic 600 11px/1.45 'JetBrains Mono',monospace;
      color: var(--txt-soft,#9aa0b4); min-height: 30px; }
  `;
  document.head.appendChild(s);
}