// ============================================================
//  UI · RECAP — the AUTON RECAP card (NEW in v0.7)
// ============================================================
//  Slides in over the 3D field after the final tally: winner
//  headline, scores, one contribution card per bot (with the points
//  it banked and chips for everything it did), an MVP star, and
//  buttons to peek back at the field or jump straight into teleop.
//
//  Stats are accumulated by main.js from the auton event stream, so
//  this works for BOTH challenges with zero per-game code here.
//  Styles are injected (same pattern as the challenge selector) so
//  styles.css stays untouched.
// ============================================================

import { DRIVETRAINS } from '../config.js';

let root = null;

export function hideRecap() {
  if (root) { root.remove(); root = null; }
}

/**
 * Show the recap card.
 *   host          — element to append to (the match screen)
 *   stats         — { [botId]: { points, chips: [string] } }
 *   scores        — { red, blue } final auton scores
 *   config        — bot config (for drivetrain labels)
 *   onBeginTeleop — called when BEGIN TELEOP is pressed
 */
export function showRecap({ host, stats, scores, config, onBeginTeleop }) {
  hideRecap();
  injectRecapStyles();

  const red = scores.red | 0, blue = scores.blue | 0;
  const winner = red === blue ? 'tie' : red > blue ? 'red' : 'blue';
  const headline = winner === 'tie' ? 'AUTON TIED'
    : winner === 'red' ? 'RED TAKES AUTON' : 'BLUE TAKES AUTON';

  // MVP = most individual points (first in reading order wins ties at > 0)
  const ids = Object.keys(stats);
  let mvp = null, best = 0;
  for (const id of ids) {
    const p = stats[id]?.points || 0;
    if (p > best) { best = p; mvp = id; }
  }

  const botCard = (id) => {
    const s = stats[id] || { points: 0, chips: [] };
    const al = id[0] === 'R' ? 'red' : 'blue';
    const dt = config?.[id] ? (DRIVETRAINS[config[id].drivetrain]?.label || '') : '';
    const chips = s.chips.length
      ? s.chips.map(c => `<span class="recap-chip">${c}</span>`).join('')
      : '<span class="recap-chip recap-chip--quiet">no scoring</span>';
    return `
      <div class="recap-bot recap-bot--${al}${id === mvp ? ' is-mvp' : ''}">
        <div class="recap-bot__head">
          <span class="recap-bot__id">${id}</span>
          <span class="recap-bot__dt">${dt}</span>
          ${id === mvp ? '<span class="recap-bot__mvp">★ MVP</span>' : ''}
          <span class="recap-bot__pts">+${s.points || 0}</span>
        </div>
        <div class="recap-bot__chips">${chips}</div>
      </div>`;
  };

  root = document.createElement('div');
  root.className = `auton-recap is-${winner}`;
  root.innerHTML = `
    <div class="auton-recap__card">
      <div class="auton-recap__eyebrow">AUTON RECAP</div>
      <div class="auton-recap__headline">${headline}</div>
      <div class="auton-recap__scores">
        <span class="auton-recap__s auton-recap__s--red">RED ${red}</span>
        <span class="auton-recap__dot">·</span>
        <span class="auton-recap__s auton-recap__s--blue">BLUE ${blue}</span>
      </div>
      <div class="auton-recap__grid">
        ${['R1', 'R2', 'R3', 'B1', 'B2', 'B3'].map(botCard).join('')}
      </div>
      <div class="auton-recap__actions">
        <button type="button" class="auton-recap__btn auton-recap__btn--ghost" id="recap-view-field">VIEW FIELD</button>
        <button type="button" class="auton-recap__btn auton-recap__btn--gold" id="recap-begin-teleop">BEGIN TELEOP ▸</button>
      </div>
    </div>
  `;
  host.appendChild(root);

  root.querySelector('#recap-view-field').addEventListener('click', () => hideRecap());
  root.querySelector('#recap-begin-teleop').addEventListener('click', () => {
    hideRecap();
    if (onBeginTeleop) onBeginTeleop();
  });

  // double-rAF so the entrance transition actually plays
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (root) root.classList.add('is-shown');
  }));
}

function injectRecapStyles() {
  if (document.getElementById('recap-styles')) return;
  const s = document.createElement('style');
  s.id = 'recap-styles';
  s.textContent = `
    .auton-recap {
      position: absolute; inset: 0; z-index: 40;
      display: flex; align-items: center; justify-content: center;
      background: rgba(10, 11, 17, 0.66); backdrop-filter: blur(3px);
      opacity: 0; transition: opacity 260ms ease; pointer-events: auto;
      overflow-y: auto; padding: 24px;
    }
    .auton-recap.is-shown { opacity: 1; }
    .auton-recap__card {
      width: min(880px, 94vw); margin: auto;
      background: linear-gradient(180deg, #161827, #11121b);
      border: 2px solid rgba(255, 247, 228, 0.14); border-radius: 22px;
      box-shadow: 0 18px 60px rgba(0, 0, 0, 0.55);
      padding: clamp(20px, 3vw, 36px);
      transform: translateY(18px) scale(0.97); transition: transform 320ms cubic-bezier(.2,.9,.25,1.15);
      text-align: center;
    }
    .auton-recap.is-shown .auton-recap__card { transform: none; }
    .auton-recap.is-red  .auton-recap__card { border-color: rgba(230, 57, 70, 0.55); }
    .auton-recap.is-blue .auton-recap__card { border-color: rgba(30, 136, 229, 0.55); }

    .auton-recap__eyebrow {
      font: 700 12px/1 'JetBrains Mono', monospace; letter-spacing: 0.24em;
      color: #ffd23f; margin-bottom: 10px;
    }
    .auton-recap__headline {
      font-family: 'Bowlby One', system-ui, sans-serif;
      font-size: clamp(28px, 4.4vw, 48px); letter-spacing: 0.03em; color: #fff;
      text-shadow: 0 4px 0 rgba(0,0,0,0.4), 0 0 28px rgba(255,182,39,0.32);
    }
    .auton-recap.is-red  .auton-recap__headline { color: #ffd7db; }
    .auton-recap.is-blue .auton-recap__headline { color: #d6e9f9; }
    .auton-recap__scores {
      margin: 10px 0 18px; font-family: 'Bowlby One', system-ui, sans-serif;
      font-size: clamp(18px, 2.4vw, 26px);
    }
    .auton-recap__s--red  { color: #e63946; }
    .auton-recap__s--blue { color: #1e88e5; }
    .auton-recap__dot { opacity: 0.5; margin: 0 12px; color: #fff; }

    .auton-recap__grid {
      display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
      gap: 12px; text-align: left;
    }
    .recap-bot {
      background: rgba(255,247,228,0.035); border: 1.5px solid rgba(255,247,228,0.12);
      border-left-width: 5px; border-radius: 13px; padding: 12px 14px;
      display: flex; flex-direction: column; gap: 9px;
    }
    .recap-bot--red  { border-left-color: #e63946; }
    .recap-bot--blue { border-left-color: #1e88e5; }
    .recap-bot.is-mvp { border-color: rgba(255,210,63,0.7); box-shadow: 0 0 16px rgba(255,210,63,0.18); }
    .recap-bot__head { display: flex; align-items: baseline; gap: 8px; }
    .recap-bot__id {
      font-family: 'Bowlby One', system-ui, sans-serif; font-size: 19px; color: #fff;
    }
    .recap-bot__dt {
      font: 600 10px/1 'JetBrains Mono', monospace; letter-spacing: 0.08em;
      color: #9aa0b4; text-transform: uppercase;
    }
    .recap-bot__mvp {
      font: 800 10px/1 'JetBrains Mono', monospace; letter-spacing: 0.1em;
      color: #11121b; background: #ffd23f; border-radius: 99px; padding: 3px 7px;
    }
    .recap-bot__pts {
      margin-left: auto; font-family: 'Bowlby One', system-ui, sans-serif;
      font-size: 19px; color: #ffd23f;
    }
    .recap-bot__chips { display: flex; flex-wrap: wrap; gap: 6px; }
    .recap-chip {
      font: 600 10.5px/1 'JetBrains Mono', monospace; letter-spacing: 0.04em;
      color: #fff7e4; background: rgba(255,247,228,0.08);
      border: 1px solid rgba(255,247,228,0.14); border-radius: 99px; padding: 4px 9px;
    }
    .recap-chip--quiet { color: #9aa0b4; font-style: italic; }

    .auton-recap__actions { display: flex; gap: 14px; margin-top: 20px; }
    .auton-recap__btn {
      flex: 1; padding: 14px 18px; cursor: pointer; border-radius: 13px;
      font-family: 'Bowlby One', system-ui, sans-serif; font-size: 15px; letter-spacing: 0.06em;
      border: 2.5px solid #0d0e15; transition: transform 120ms ease, filter 120ms ease;
    }
    .auton-recap__btn:hover { transform: translateY(-2px); filter: brightness(1.1); }
    .auton-recap__btn:active { transform: translateY(1px); }
    .auton-recap__btn--ghost { background: #23252f; color: #fff7e4; }
    .auton-recap__btn--gold { background: linear-gradient(180deg, #ffd23f, #e3a81d); color: #11121b; }
  `;
  document.head.appendChild(s);
}
