// ============================================================
//  UI · SETUP — bot config form, RUN/RESET, screen switching
// ============================================================

import { BOT_IDS, DEFAULTS, DRIVETRAINS, SCRIPTS } from '../config.js';

export function buildSetupForm() {
  BOT_IDS.forEach(buildBotConfig);
}

function buildBotConfig(botId) {
  const def = DEFAULTS[botId];
  const el = document.querySelector(`.bot[data-bot="${botId}"]`);
  if (!el) return;

  el.innerHTML = `
    <div class="bot__id">${botId}</div>
    <div class="bot__field">
      <label>Drive</label>
      <select data-stat="drivetrain">
        ${Object.entries(DRIVETRAINS).map(([k, v]) =>
          `<option value="${k}" ${k === def.drivetrain ? 'selected' : ''}>${v.label}</option>`
        ).join('')}
      </select>
    </div>
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
    <div class="bot__field bot__script">
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
