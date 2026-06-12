// ============================================================
//  UI · INTRO — the MATCH PREVIEW card (NEW in v0.8)
// ============================================================
//  Broadcast-style pre-match lineup: both alliances slide in with
//  drivetrain, stat line, and the auton each bot is running, around
//  a VS badge and the challenge title. It appears the instant RUN is
//  pressed (so asset loading happens BEHIND it instead of as a dead
//  "LOADING" beat); once the field is ready the footer arms into a
//  gold START MATCH button, and the card sweeps away into the
//  camera fly-in.
//
//  Flow contract (main.js):
//    const intro = showIntro({ host, config });   // immediately visible
//    await loadMatchAssets(config);               // loads behind the card
//    await intro.start();                          // arms button, resolves on click
//
//  INTRO.enabled (style.js) kills the whole sequence — RUN then goes
//  straight to the countdown exactly like v0.7.
// ============================================================

import { SCRIPTS, DRIVETRAINS, ACTIVE_CHALLENGE, BOT_IDS } from '../config.js';
import { CHALLENGE_CARDS } from '../challenges.js';

let root = null;

const scriptLabel = key =>
  CHALLENGE_CARDS[ACTIVE_CHALLENGE]?.scriptCopy?.[key]?.label || SCRIPTS[key]?.label || key;

export function showIntro({ host, config }) {
  destroyIntro();
  injectIntroStyles();

  const card = CHALLENGE_CARDS[ACTIVE_CHALLENGE];
  const title = (card?.label || 'Rapid React').toUpperCase();
  const kind = card?.scoringModel === 'manipulator' ? 'MANIPULATION' : 'SHOOTING';

  const botRow = (id) => {
    const c = config[id];
    const dt = DRIVETRAINS[c.drivetrain]?.label || c.drivetrain;
    return `
      <div class="mi-bot">
        <span class="mi-bot__id">${id}</span>
        <span class="mi-bot__dt">${dt}</span>
        <span class="mi-bot__stats">S${c.scoring} · I${c.intake} · C${c.climber}</span>
        <span class="mi-bot__script">${scriptLabel(c.script)}</span>
      </div>`;
  };

  root = document.createElement('div');
  root.className = 'match-intro';
  root.innerHTML = `
    <div class="match-intro__card">
      <div class="match-intro__eyebrow">PRACTICE MATCH · ${kind}</div>
      <div class="match-intro__title">${title}</div>
      <div class="match-intro__board">
        <div class="mi-side mi-side--red">
          <div class="mi-side__name">RED ALLIANCE</div>
          ${BOT_IDS.filter(id => id[0] === 'R').map(botRow).join('')}
        </div>
        <div class="mi-vs"><span>VS</span></div>
        <div class="mi-side mi-side--blue">
          <div class="mi-side__name">BLUE ALLIANCE</div>
          ${BOT_IDS.filter(id => id[0] === 'B').map(botRow).join('')}
        </div>
      </div>
      <div class="match-intro__foot" id="mi-foot">
        <span class="mi-loading"><i></i><i></i><i></i></span> PREPARING FIELD
      </div>
    </div>
  `;
  host.appendChild(root);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (root) root.classList.add('is-shown');
  }));

  return {
    /** Arm the START button (assets are ready); resolves on click. */
    start() {
      return new Promise(resolve => {
        if (!root) { resolve(); return; }
        const foot = root.querySelector('#mi-foot');
        foot.innerHTML = `<button type="button" class="mi-start" id="mi-start">START MATCH ▸</button>`;
        foot.querySelector('#mi-start').addEventListener('click', () => {
          if (!root) { resolve(); return; }
          root.classList.add('is-leaving');
          setTimeout(() => { destroyIntro(); resolve(); }, 340);
        }, { once: true });
      });
    },
    destroy: destroyIntro,
  };
}

export function destroyIntro() {
  if (root) { root.remove(); root = null; }
}

function injectIntroStyles() {
  if (document.getElementById('intro-styles')) return;
  const s = document.createElement('style');
  s.id = 'intro-styles';
  s.textContent = `
    .match-intro {
      position: absolute; inset: 0; z-index: 30;
      display: flex; align-items: center; justify-content: center;
      background: radial-gradient(1100px 640px at 50% 38%, rgba(34,36,52,0.92), rgba(10,11,17,0.96));
      opacity: 0; transition: opacity 260ms ease;
    }
    .match-intro.is-shown { opacity: 1; }
    .match-intro.is-leaving { opacity: 0; transition: opacity 320ms ease; }

    .match-intro__card { width: min(860px, 92vw); text-align: center; }
    .match-intro.is-shown .match-intro__card { animation: miRise 420ms cubic-bezier(.2,.9,.3,1.1) both; }
    @keyframes miRise { from { transform: translateY(26px); opacity: 0; } to { transform: none; opacity: 1; } }

    .match-intro__eyebrow {
      font: 700 12px/1 'JetBrains Mono', monospace; letter-spacing: .26em;
      color: var(--txt-soft, #9aa0b4); margin-bottom: 12px;
    }
    .match-intro__title {
      font-family: 'Bowlby One', system-ui, sans-serif;
      font-size: clamp(34px, 6vw, 64px); letter-spacing: .04em; color: #fff;
      text-shadow: 0 6px 0 rgba(0,0,0,.45), 0 0 44px rgba(255,210,63,.35);
      margin-bottom: clamp(16px, 3vh, 30px);
    }

    .match-intro__board {
      display: grid; grid-template-columns: 1fr auto 1fr; gap: clamp(10px, 2vw, 22px);
      align-items: stretch;
    }
    .mi-side {
      background: var(--panel, #11121b); border: 2px solid var(--line, rgba(255,247,228,.14));
      border-radius: 16px; padding: clamp(12px, 1.6vw, 18px);
      display: flex; flex-direction: column; gap: 8px; text-align: left;
    }
    .mi-side--red  { border-top: 4px solid var(--red, #e63946); }
    .mi-side--blue { border-top: 4px solid var(--blue, #1e88e5); }
    .mi-side__name {
      font-family: 'Bowlby One', system-ui, sans-serif; font-size: 13px; letter-spacing: .12em;
      margin-bottom: 2px;
    }
    .mi-side--red  .mi-side__name { color: var(--red, #e63946); }
    .mi-side--blue .mi-side__name { color: var(--blue, #1e88e5); }

    .mi-bot {
      display: grid; grid-template-columns: 34px 64px 1fr; grid-template-rows: auto auto;
      column-gap: 10px; align-items: baseline;
      padding: 8px 10px; border-radius: 10px; background: rgba(255,247,228,.04);
    }
    .mi-bot__id { font-family: 'Bowlby One', sans-serif; font-size: 17px; color: #fff; grid-row: span 2; }
    .mi-bot__dt { font: 700 12px/1 'JetBrains Mono', monospace; color: var(--gold, #ffd23f); }
    .mi-bot__stats { font: 600 11px/1 'JetBrains Mono', monospace; color: var(--txt-soft, #9aa0b4); }
    .mi-bot__script { grid-column: 2 / 4; font: 600 12px/1.3 'Outfit', sans-serif;
      color: rgba(255,247,228,.85); margin-top: 3px; }

    .mi-vs { display: flex; align-items: center; }
    .mi-vs span {
      font-family: 'Bowlby One', sans-serif; font-size: clamp(20px, 3vw, 30px); color: var(--ink, #16162b);
      background: linear-gradient(180deg, var(--gold, #ffd23f), var(--gold-deep, #f0a818));
      border: 3px solid var(--ink, #16162b); border-radius: 14px; padding: 12px 14px;
      box-shadow: 0 0 34px rgba(255,210,63,.35);
    }

    .match-intro__foot {
      margin-top: clamp(16px, 3vh, 28px); min-height: 56px;
      display: flex; align-items: center; justify-content: center; gap: 12px;
      font: 700 13px/1 'JetBrains Mono', monospace; letter-spacing: .2em;
      color: var(--txt-soft, #9aa0b4);
    }
    .mi-loading { display: inline-flex; gap: 5px; }
    .mi-loading i { width: 7px; height: 7px; border-radius: 50%; background: var(--gold, #ffd23f);
      animation: miDot 1s ease-in-out infinite; }
    .mi-loading i:nth-child(2) { animation-delay: .15s; }
    .mi-loading i:nth-child(3) { animation-delay: .3s; }
    @keyframes miDot { 0%, 100% { opacity: .25; transform: translateY(0); } 50% { opacity: 1; transform: translateY(-4px); } }

    .mi-start {
      padding: 15px 36px; cursor: pointer;
      background: linear-gradient(180deg, var(--gold, #ffd23f), var(--gold-deep, #f0a818));
      color: var(--ink, #16162b); border: 3px solid var(--ink, #16162b); border-radius: 13px;
      font-family: 'Bowlby One', system-ui, sans-serif; font-size: 17px; letter-spacing: .06em;
      animation: miArm 360ms cubic-bezier(.2,.9,.3,1.2) both;
      transition: transform 120ms ease, box-shadow 120ms ease;
      box-shadow: 0 0 0 rgba(255,210,63,0);
    }
    .mi-start:hover { transform: translateY(-2px); box-shadow: 0 0 28px rgba(255,210,63,.45); }
    .mi-start:active { transform: translateY(1px); }
    @keyframes miArm { from { transform: scale(.86); opacity: 0; } to { transform: scale(1); opacity: 1; } }
  `;
  document.head.appendChild(s);
}
