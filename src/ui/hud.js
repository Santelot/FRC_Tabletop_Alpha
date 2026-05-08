// ============================================================
//  UI · HUD — score, phase indicator, log
// ============================================================

const phaseEl     = () => document.getElementById('phase-display');
const phaseSubEl  = () => document.getElementById('phase-sub');
const scoreRedEl  = () => document.getElementById('score-red');
const scoreBlueEl = () => document.getElementById('score-blue');
const logEl       = () => document.getElementById('log');
const logWrap     = () => document.getElementById('match-log-wrap');
const logToggleEl = () => document.getElementById('log-toggle');

export function setPhase(phase, sub, isLive) {
  const p = phaseEl();
  const s = phaseSubEl();
  if (p) {
    p.textContent = phase;
    p.classList.toggle('is-idle', !isLive);
  }
  if (s) s.textContent = sub || '';
}

export function setScore(alliance, value) {
  const el = alliance === 'red' ? scoreRedEl() : scoreBlueEl();
  if (!el) return;
  el.textContent = value;
  el.classList.remove('is-pumping');
  void el.offsetWidth;
  el.classList.add('is-pumping');
}

export function clearScores() {
  if (scoreRedEl()) scoreRedEl().textContent = '0';
  if (scoreBlueEl()) scoreBlueEl().textContent = '0';
}

export function clearLog(placeholder = 'Match starting...') {
  const el = logEl();
  if (el) el.innerHTML = `<div class="log__placeholder">${placeholder}</div>`;
}

export function writeLog(msg, kind = '') {
  const el = logEl();
  if (!el) return;
  if (el.querySelector('.log__placeholder')) el.innerHTML = '';
  const e = document.createElement('div');
  e.className = 'log__entry' + (kind ? ` is-${kind}` : '');
  e.textContent = msg;
  el.appendChild(e);
  el.scrollTop = el.scrollHeight;
}

export function wireLogToggle() {
  const btn = logToggleEl();
  const wrap = logWrap();
  if (btn && wrap) {
    btn.addEventListener('click', () => wrap.classList.toggle('is-open'));
  }
}
