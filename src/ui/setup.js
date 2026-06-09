// ============================================================
//  UI · SETUP — bot config form, RUN/RESET, screen switching
// ============================================================

import { BOT_IDS, DEFAULTS, DRIVETRAINS, SCRIPTS, ACTIVE_CHALLENGE, setActiveChallenge } from '../config.js';
import { CHALLENGE_CARDS, CHALLENGE_IDS } from '../challenges.js';

export function buildSetupForm() {
  buildChallengeSelector();
  buildAutonPlaybook();
  BOT_IDS.forEach(buildBotConfig);
  updateChallengeLabels(ACTIVE_CHALLENGE);
}

// ============================================================
//  CHALLENGE SELECTOR — pick the game; updates labels + active challenge
// ============================================================
function buildChallengeSelector() {
  if (document.getElementById('challenge-select')) return;
  const host = document.querySelector('.setup');
  if (!host) return;
  injectChalselStyles();

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
}

function injectChalselStyles() {
  if (document.getElementById('chalsel-styles')) return;
  const s = document.createElement('style');
  s.id = 'chalsel-styles';
  s.textContent = `
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
  `;
  document.head.appendChild(s);
}

/**
 * Reference panel: a card per auton describing what it does, the points it can
 * earn, and a strategic tip — so testers can choose without memorising the rules.
 * Built once (guarded), injected at the top of the setup column.
 */
function buildAutonPlaybook() {
  if (document.getElementById('auton-playbook')) return;
  const host = document.querySelector('.setup');
  if (!host) return;

  const cards = Object.entries(SCRIPTS).map(([key, s]) => `
    <div class="pb-card pb-card--${key}">
      <div class="pb-card__name">${s.label}</div>
      <div class="pb-card__detail">${s.detail || s.desc}</div>
      <div class="pb-card__row">
        <span class="pb-card__k">SCORES</span>
        <span class="pb-card__v">${s.scores || '—'}</span>
      </div>
      ${s.tip ? `<div class="pb-card__tip">${s.tip}</div>` : ''}
    </div>
  `).join('');

  const section = document.createElement('section');
  section.className = 'playbook is-open';
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

function buildBotConfig(botId) {
  const def = DEFAULTS[botId];
  const el = document.querySelector(`.bot[data-bot="${botId}"]`);
  if (!el) return;

  el.innerHTML = `
    <div class="bot__id">${botId}</div>
    <div class="bot__field bot__field--wide">
      <label>Drive</label>
      <select data-stat="drivetrain">
        ${Object.entries(DRIVETRAINS).map(([k, v]) =>
          `<option value="${k}" ${k === def.drivetrain ? 'selected' : ''}>${v.label}</option>`
        ).join('')}
      </select>
    </div>
    <div class="bot__stats">
      <div class="bot__field">
        <label>Score</label>
        <select data-stat="scoring">
          ${[1,2,3].map(t => `<option value="${t}" ${t === def.scoring ? 'selected' : ''}>L${t}</option>`).join('')}
        </select>
      </div>
      <div class="bot__field">
        <label>Intake</label>
        <select data-stat="intake">
          ${[1,2,3].map(t => `<option value="${t}" ${t === def.intake ? 'selected' : ''}>L${t}</option>`).join('')}
        </select>
      </div>
      <div class="bot__field">
        <label>Climb</label>
        <select data-stat="climber">
          ${[0,1,2,3].map(t => `<option value="${t}" ${t === def.climber ? 'selected' : ''}>L${t}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="bot__field bot__field--wide bot__script">
      <label>Auton</label>
      <select data-stat="script">
        ${Object.entries(SCRIPTS).map(([k, v]) =>
          `<option value="${k}" ${k === def.script ? 'selected' : ''}>${v.label}</option>`
        ).join('')}
      </select>
      <div class="bot__script-desc">${SCRIPTS[def.script].desc}</div>
    </div>
  `;

  // Live description update
  const scriptSelect = el.querySelector('[data-stat="script"]');
  const descEl = el.querySelector('.bot__script-desc');
  scriptSelect.addEventListener('change', () => {
    descEl.textContent = SCRIPTS[scriptSelect.value].desc;
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
  document.getElementById('screen-setup').classList.toggle('is-active', name === 'setup');
  document.getElementById('screen-match').classList.toggle('is-active', name === 'match');
  // Notify any listeners (e.g. Three.js needs to resize after the canvas becomes visible)
  window.dispatchEvent(new Event('resize'));
}
