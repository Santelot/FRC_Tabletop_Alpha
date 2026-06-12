// ============================================================
//  UI · HOME — the title screen (NEW in v1.1)
// ============================================================
//  The app no longer opens into a form. It opens into a floodlit
//  arena: the wordmark builds in letter by letter, the two
//  challenges sit below as big cartridge cards, and two doors lead
//  out — ENTER THE PIT (lineup setup) or QUICK MATCH (random
//  scrimmage, straight to the broadcast).
//
//  Picking a cartridge here drives the SAME challenge pipeline as
//  the Pit Wall selector (it literally clicks it), so every label,
//  playbook entry, and projection stays in sync.
// ============================================================

import { ACTIVE_CHALLENGE } from '../config.js';
import { CHALLENGE_CARDS, CHALLENGE_IDS } from '../challenges.js';
import { showScreen } from './setup.js';

const KIND = { shooter: 'SHOOTING', manipulator: 'MANIPULATION' };
const TAGLINE = {
  rapid_react: 'Launch cargo into the hub',
  charged_up:  'Place cones & cubes, then balance',
};

export function buildHome() {
  const host = document.getElementById('home-content');
  if (!host || host.dataset.built) return;
  host.dataset.built = '1';

  const word = (txt) => [...txt].map((ch, i) =>
    ch === ' ' ? '<span class="hm-sp"></span>'
               : `<span class="hm-ch" style="--i:${i}">${ch}</span>`).join('');

  const cards = CHALLENGE_IDS.map(id => {
    const c = CHALLENGE_CARDS[id];
    const on = id === ACTIVE_CHALLENGE ? ' is-on' : '';
    return `
      <button type="button" class="hm-cart${on}" data-ch="${id}">
        <span class="hm-cart__kind">${KIND[c.scoringModel] || ''}</span>
        <span class="hm-cart__name">${c.label}</span>
        <span class="hm-cart__tag">${TAGLINE[id] || ''}</span>
        <span class="hm-cart__sel">SELECTED ▸</span>
      </button>`;
  }).join('');

  host.innerHTML = `
    <div class="hm-fx" aria-hidden="true"><i></i><i></i></div>
    <div class="hm-inner">
      <div class="hm-eyebrow">THE TABLETOP COMPANION</div>
      <h1 class="hm-wordmark">
        <span class="hm-line">${word('FRC AUTON')}</span>
        <span class="hm-line hm-line--sub">${word('· 3D ·')}</span>
      </h1>
      <div class="hm-rule" aria-hidden="true"></div>
      <div class="hm-pick">CHOOSE YOUR CHALLENGE</div>
      <div class="hm-carts">${cards}</div>
      <div class="hm-doors">
        <button type="button" class="hm-door hm-door--gold" id="btn-enter-pit">ENTER THE PIT ▸</button>
        <button type="button" class="hm-door" id="btn-quick-match">⚡ QUICK MATCH</button>
      </div>
      <div class="hm-foot">random lineup, straight to the broadcast — or build yours in the pit</div>
    </div>
  `;

  // Cartridge select — drives the Pit Wall's own challenge pipeline.
  host.querySelectorAll('.hm-cart').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.ch;
      host.querySelectorAll('.hm-cart').forEach(b => b.classList.toggle('is-on', b === btn));
      const pitBtn = document.querySelector(`.chalsel__opt[data-ch="${id}"]`);
      if (pitBtn && !pitBtn.classList.contains('is-on')) pitBtn.click();
    });
  });

  host.querySelector('#btn-enter-pit').addEventListener('click', () => showScreen('setup'));

  host.querySelector('#btn-quick-match').addEventListener('click', () => {
    document.getElementById('pw-randomize')?.click();   // deal a scrimmage
    document.getElementById('btn-run')?.click();        // and roll the broadcast
  });

  // Topbar HOME link (setup screen)
  document.getElementById('btn-home')?.addEventListener('click', () => {
    syncCartridges();
    showScreen('home');
  });
}

/** Re-highlight the cartridge matching the live challenge (pit may have changed it). */
function syncCartridges() {
  document.querySelectorAll('.hm-cart').forEach(b =>
    b.classList.toggle('is-on', b.dataset.ch === ACTIVE_CHALLENGE));
}
