// ============================================================
//  AUDIO — tiny Web Audio synth for match sound effects
// ============================================================
//  Option 1 of the sound plan: every effect is SYNTHESIZED here.
//  No audio files ship with the project, which keeps it clear of any
//  third-party recordings (and the licensing questions that come with
//  them). Tune everything from the AUDIO block in style.js.
//
//  Deliberately small — no audio-graph spaghetti:
//    - ONE AudioContext, created lazily on the first user gesture
//      (the RUN AUTON click). Browsers block audio before a gesture.
//    - ONE tone() helper + ONE noise() helper. Every sound is a short
//      recipe built from those two.
//    - Fire-and-forget. play() never throws and never needs awaiting.
//
//  Public API:
//     initAudio()       — call once inside a user-gesture handler
//     play(key, opts?)  — trigger a named sound (see `recipes` below)
//     setMuted(bool)    — mute / unmute
//     isMuted()         — current mute state
//     toggleMuted()     — flip, returns the new state
// ============================================================

import { AUDIO } from './style.js';

let ctx = null;
let masterGain = null;
let muted = AUDIO.muteByDefault;

/**
 * Lazily create (or resume) the AudioContext. Safe to call repeatedly.
 * Call this inside a user-gesture handler (e.g. a button click), or the
 * context may be created suspended on some browsers.
 */
export function initAudio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    masterGain = ctx.createGain();
    masterGain.gain.value = AUDIO.master;
    masterGain.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
}

export function setMuted(v)   { muted = !!v; }
export function isMuted()     { return muted; }
export function toggleMuted() { muted = !muted; return muted; }

// ============================================================
//  Low-level: one enveloped oscillator
// ============================================================
function tone({
  freq = 440, freqEnd = null, dur = 0.15, type = 'sine',
  vol = 0.5, attack = 0.005, release = 0.06, delay = 0, detune = 0,
  filterFreq = null, filterType = 'lowpass',
}) {
  const t0 = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();

  osc.type = type;
  osc.detune.value = detune;
  osc.frequency.setValueAtTime(freq, t0);
  if (freqEnd !== null) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t0 + dur);
  }

  // Gain envelope: attack ramp → hold → release ramp to (near) silence.
  const peak = Math.max(0.0001, vol);
  const hold = t0 + Math.max(attack, dur - release);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + attack);
  g.gain.setValueAtTime(peak, hold);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

  // Optional filter — warms up brassy saws so they read as horns, not buzzers.
  // (Skipped entirely when filterFreq is null, so other sounds are unchanged.)
  if (filterFreq !== null) {
    const f = ctx.createBiquadFilter();
    f.type = filterType;
    f.frequency.value = filterFreq;
    osc.connect(f).connect(g).connect(masterGain);
  } else {
    osc.connect(g).connect(masterGain);
  }

  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

// ============================================================
//  Low-level: one short burst of filtered noise
// ============================================================
function noise({
  dur = 0.15, vol = 0.4, filter = 'lowpass',
  filterFreq = 800, filterQ = 1, delay = 0,
}) {
  const t0 = ctx.currentTime + delay;
  const frames = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, frames, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;

  const src = ctx.createBufferSource();
  src.buffer = buf;

  const biquad = ctx.createBiquadFilter();
  biquad.type = filter;
  biquad.frequency.value = filterFreq;
  biquad.Q.value = filterQ;

  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0001, vol), t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

  src.connect(biquad).connect(g).connect(masterGain);
  src.start(t0);
  src.stop(t0 + dur + 0.02);
}

// ============================================================
//  SOUND RECIPES — each key maps to an auton event in main.js.
//  `v` is the per-sound volume from AUDIO.volumes (already looked up).
// ============================================================
const recipes = {
  // Countdown 3-2-1 pips, brighter "GO!"
  countdownBeep: (v) => tone({ freq: 660, dur: 0.12, type: 'square', vol: 0.5 * v }),
  // Match-start fanfare — our take on the classic "charge" trumpet call,
  // the "turu-ruru-turuuuu". Fires on "GO!". A quick rising brass run that
  // resolves to a held major chord. Tune the feel by editing the notes below.
  countdownGo: (v) => {
    const brass = (freq, t, dur, vol, rel = 0.08, detune = 0) => tone({
      freq, dur, type: 'sawtooth', vol: vol * v,
      attack: 0.02, release: rel, delay: t, detune, filterFreq: 2600,
    });
    // Rising pickup run: G4 → C5 → E5
    brass(392, 0.00, 0.13, 0.45);
    brass(523, 0.13, 0.13, 0.45);
    brass(659, 0.26, 0.13, 0.45);
    // Triumphant held G-major chord (G5 lead + B5 third + D5 fifth). The lead
    // is doubled slightly detuned so it reads as a section, not one horn.
    brass(784, 0.42, 0.72, 0.55, 0.34,  6);
    brass(784, 0.42, 0.72, 0.30, 0.34, -6);
    brass(988, 0.42, 0.72, 0.32, 0.34,  0);
    brass(587, 0.42, 0.72, 0.30, 0.34,  0);
  },

  // One shared whir per tick (pitch-jittered so it isn't robotic).
  move: (v, opts = {}) => {
    const jitter = opts.pitchJitter ?? 0;
    const f = 520 * (1 + (Math.random() - 0.5) * jitter * 2);
    noise({ dur: 0.13, vol: 0.5 * v, filter: 'lowpass', filterFreq: f, filterQ: 4 });
  },

  pickup: (v) => tone({ freq: 880, freqEnd: 1320, dur: 0.09, type: 'triangle', vol: 0.6 * v }),

  // Synthy zap: two detuned saw sweeps falling fast.
  disruptor: (v) => {
    tone({ freq: 1200, freqEnd: 180, dur: 0.26, type: 'sawtooth', vol: 0.5 * v, detune: 8 });
    tone({ freq: 1180, freqEnd: 170, dur: 0.26, type: 'sawtooth', vol: 0.3 * v, detune: -8 });
  },

  // Pneumatic release.
  shotWhoosh: (v) => noise({ dur: 0.22, vol: 0.5 * v, filter: 'highpass', filterFreq: 900, filterQ: 0.7 }),

  // Thunk-and-bell on a make.
  hit: (v) => {
    tone({ freq: 160,  dur: 0.10, type: 'square', vol: 0.6 * v });
    tone({ freq: 880,  dur: 0.30, type: 'sine',   vol: 0.5 * v,  delay: 0.04 });
    tone({ freq: 1320, dur: 0.34, type: 'sine',   vol: 0.35 * v, delay: 0.04 });
  },

  // Dull clunk on a miss.
  miss: (v) => tone({ freq: 150, freqEnd: 90, dur: 0.18, type: 'square', vol: 0.55 * v }),

  // Two-note rising chime when the score ticks up.
  // Score — a clean, modern bell chime: a fast ascending E-major triad that
  // rings out with a high-octave shimmer. Pure sine timbre (no arcade buzz)
  // plus long release tails give that satisfying "ting" instead of a blip.
  score: (v) => {
    const bell = (freq, t, vol, dur = 0.5, rel = 0.4) => tone({
      freq, dur, type: 'sine', vol: vol * v, attack: 0.003, release: rel, delay: t,
    });
    bell(659,  0.000, 0.50);             // E5
    bell(831,  0.045, 0.42);             // G#5
    bell(988,  0.090, 0.46);             // B5
    bell(1319, 0.090, 0.22, 0.62, 0.5);  // E6 shimmer, longer tail
    // tiny bright transient for a crisp, modern attack
    tone({ freq: 2637, dur: 0.06, type: 'triangle', vol: 0.12 * v, attack: 0.001, release: 0.05 });
  },

  // Happy chirp on park / taxi.
  park: (v) => {
    tone({ freq: 784,  dur: 0.10, type: 'triangle', vol: 0.5 * v });
    tone({ freq: 1175, dur: 0.16, type: 'triangle', vol: 0.5 * v, delay: 0.09 });
  },

  // Air-horn-ish swell on the final banner.
  // Rough end-of-auto horn — a low, gritty klaxon at auton complete. The two
  // saws sit a few Hz apart so they beat against each other; that beating IS
  // the roughness. Want it rougher, widen the gap (162 vs 170); cleaner, narrow it.
  final: (v) => {
    tone({ freq: 162, freqEnd: 150, dur: 0.9, type: 'sawtooth', vol: 0.55 * v, attack: 0.012, release: 0.14, filterFreq: 1500 });
    tone({ freq: 170, freqEnd: 156, dur: 0.9, type: 'sawtooth', vol: 0.50 * v, attack: 0.012, release: 0.14, filterFreq: 1500 });
    tone({ freq: 81,  freqEnd: 76,  dur: 0.9, type: 'square',   vol: 0.40 * v, attack: 0.012, release: 0.14 }); // sub honk for body
  },

  // ---------------------------------------------------------
  //  added v0.7 — Charged Up placement + endgame
  // ---------------------------------------------------------

  // Cone/cube settles into the rack — soft thunk + bright bell (a lighter
  // cousin of `hit`, pitched up so HUB hits and placements read differently).
  place: (v) => {
    tone({ freq: 190,  dur: 0.09, type: 'square', vol: 0.5 * v });
    tone({ freq: 988,  dur: 0.30, type: 'sine',   vol: 0.45 * v, delay: 0.05 });
    tone({ freq: 1480, dur: 0.34, type: 'sine',   vol: 0.28 * v, delay: 0.05 });
  },

  // Bobbled placement — sad descending wobble + a clatter of noise as
  // the piece hits the carpet.
  fumble: (v) => {
    tone({ freq: 520, freqEnd: 180, dur: 0.28, type: 'triangle', vol: 0.55 * v });
    tone({ freq: 470, freqEnd: 160, dur: 0.28, type: 'triangle', vol: 0.35 * v, detune: -10, delay: 0.03 });
    noise({ dur: 0.16, vol: 0.4 * v, filter: 'bandpass', filterFreq: 700, filterQ: 1.5, delay: 0.16 });
  },

  // Climbing the charge station — an ascending mechanical ratchet
  // (four rising clicks + a band of motor noise underneath).
  climb: (v) => {
    [330, 392, 494, 587].forEach((f, i) => {
      tone({ freq: f, dur: 0.10, type: 'square', vol: 0.4 * v, delay: i * 0.085 });
    });
    noise({ dur: 0.30, vol: 0.22 * v, filter: 'bandpass', filterFreq: 1200, filterQ: 2, delay: 0.05 });
  },

  // ENGAGED! — short brass stab (a one-bar sting; the big "GO!" fanfare
  // stays reserved for match start).
  fanfare: (v) => {
    const brass = (freq, t, dur, vol, detune = 0) => tone({
      freq, dur, type: 'sawtooth', vol: vol * v,
      attack: 0.015, release: 0.12, delay: t, detune, filterFreq: 2400,
    });
    brass(523, 0.00, 0.14, 0.40);        // C5 pickup
    brass(659, 0.12, 0.42, 0.50,  5);    // E5 held, doubled ±detune
    brass(659, 0.12, 0.42, 0.30, -5);
    brass(523, 0.12, 0.42, 0.30);        // C5 under
  },

  // Crowd swell — layered band-passed noise with a couple of far-off
  // whistle blips. Plays on ENGAGED and the final banner.
  cheer: (v) => {
    noise({ dur: 1.4, vol: 0.5 * v, filter: 'bandpass', filterFreq: 850,  filterQ: 0.7 });
    noise({ dur: 1.1, vol: 0.3 * v, filter: 'bandpass', filterFreq: 1600, filterQ: 1.2, delay: 0.15 });
    [1318, 1760].forEach((f, i) => tone({
      freq: f, freqEnd: f * 1.06, dur: 0.18, type: 'sine', vol: 0.12 * v, delay: 0.25 + i * 0.3,
    }));
  },
};

/**
 * Trigger a named sound. Fire-and-forget — never throws.
 *   play('hit')
 *   play('move', { pitchJitter: 0.3 })
 */
export function play(key, opts = {}) {
  if (muted || !ctx || !masterGain) return;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  const recipe = recipes[key];
  if (!recipe) return;
  const v = AUDIO.volumes?.[key] ?? 1.0;
  try { recipe(v, opts); } catch (_) { /* audio must never break the show */ }
}