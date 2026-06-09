// ============================================================
//  AUTON ORCHESTRATOR
// ============================================================
//  Async generator that walks through the auton, yielding events
//  the renderer turns into Three.js animations.
//
//  Events yielded:
//   { type: 'log', text, kind }
//   { type: 'banner', text, variant, duration }
//   { type: 'set_phase', phase, sub, isLive }
//   { type: 'pause', ms }
//   { type: 'tick_move', moves }                 — handler routes per drivetrain
//   { type: 'pickup', botId, pieceId }
//   { type: 'cargo_update', botId, held, max }   — for cargo indicator UI
//   { type: 'park_score', botId, points, alliance, hexPos }
//   { type: 'defensive_set', botId, hexPos, blocks }
//   { type: 'disruptor_fire', sourceId, targetId, sourcePos, targetPos }
//   { type: 'face_hub', botId }                  — bot rotates to face hub
//   { type: 'shot_aim', botId, hexPos }
//   { type: 'shot_resolve', botId, hit, points, alliance, hexPos }
//   { type: 'cargo_consumed', botId }
//   { type: 'score_update', alliance, total }
// ============================================================

import {
  BOT_IDS, SCRIPTS, SHOT_POINTS, PARK_POINTS, MAX_TICKS, DRIVETRAINS, ACTIVE_CHALLENGE,
} from '../config.js';
import { CHALLENGE_CARDS } from '../challenges.js';
import { TIMING } from '../style.js';
import {
  planTarget, planTick, allBotsAtTarget, resolvePickups,
} from './planning.js';
import { rollShot, findDisruptorTarget, rollDisplay } from './shots.js';
import { hexCenter, getNeighbors, hexKey, HUB_KEYS, hexDist, HUB_CENTER } from './hex.js';

export async function* runAuton(state) {
  // Placement challenges (Charged Up) run their own auton; shooters fall through.
  const card = CHALLENGE_CARDS[ACTIVE_CHALLENGE];
  if (card && card.scoring?.kind !== 'shoot') {
    yield* runPlacementAuton(state, card);
    return;
  }

  // -------- Plan targets --------
  for (const id of BOT_IDS) {
    state.bots[id].target = planTarget(state.bots[id]);
  }

  // -------- Initialize cargo indicators (everyone starts with 1) --------
  for (const id of BOT_IDS) {
    const b = state.bots[id];
    yield { type: 'cargo_update', botId: id, held: b.heldCargo, max: b.maxCargo };
  }

  // -------- Reveal scripts in the log --------
  yield { type: 'log', text: 'Scripts revealed.', kind: 'event' };
  for (const id of BOT_IDS) {
    const bot = state.bots[id];
    yield { type: 'log', text: `${id} → ${SCRIPTS[bot.script].label}`, kind: bot.alliance };
  }

  // -------- Countdown intro --------
  yield { type: 'set_phase', phase: 'AUTON', sub: 'STARTING', isLive: false };
  yield { type: 'banner', text: 'AUTON', variant: 'small', duration: TIMING.countdownNumberMs + 100 };
  yield { type: 'pause', ms: TIMING.countdownStepMs };
  for (const n of ['3', '2', '1']) {
    yield { type: 'banner', text: n, variant: 'big', duration: TIMING.countdownNumberMs };
    yield { type: 'pause', ms: TIMING.countdownStepMs };
  }
  yield { type: 'banner', text: 'GO!', variant: 'big', duration: TIMING.countdownNumberMs + 100 };
  yield { type: 'set_phase', phase: 'AUTON', sub: 'IN PROGRESS', isLive: true };
  yield { type: 'pause', ms: 450 };

  // -------- Movement phase --------
  for (let tick = 0; tick < MAX_TICKS; tick++) {
    const moves = planTick(state);
    yield { type: 'tick_move', moves };

    // Apply moves to state after the renderer animates them
    for (const id of BOT_IDS) state.bots[id].pos = moves[id];

    // Resolve pickups
    const pickups = resolvePickups(state);
    for (const p of pickups) {
      yield { type: 'pickup', botId: p.botId, pieceId: p.pieceId };
      const b = state.bots[p.botId];
      yield { type: 'cargo_update', botId: p.botId, held: b.heldCargo, max: b.maxCargo };
      yield { type: 'log', text: `${p.botId} picks up cargo`, kind: 'event' };
    }

    if (allBotsAtTarget(state)) break;
  }

  yield { type: 'pause', ms: TIMING.postMovementMs };

  // -------- Disruptor --------
  const disruptors = BOT_IDS
    .map(id => state.bots[id])
    .filter(b => b.script === 'disruptor');

  for (const d of disruptors) {
    const target = findDisruptorTarget(d, state);
    if (!target) {
      yield { type: 'log', text: `${d.id} disruptor has no opposing shooters to target`, kind: 'event' };
      continue;
    }

    yield { type: 'banner', text: `${d.id} · DISRUPTOR`, variant: 'small', duration: TIMING.disruptorBannerMs };
    yield { type: 'pause', ms: 300 };

    target.disrupted = true;
    yield {
      type: 'disruptor_fire',
      sourceId: d.id,
      targetId: target.id,
      sourcePos: hexCenter(d.pos.col, d.pos.row),
      targetPos: hexCenter(target.pos.col, target.pos.row),
    };
    yield { type: 'log', text: `${d.id} DISRUPTS ${target.id} — opposing rolls take worse of two`, kind: 'event' };
    yield { type: 'pause', ms: TIMING.disruptorPostMs };
  }

  yield { type: 'pause', ms: TIMING.postDisruptorMs };

  // -------- Cross & Park scoring --------
  for (const id of BOT_IDS) {
    const bot = state.bots[id];
    if (bot.script !== 'cross_park') continue;
    bot.points += PARK_POINTS;
    const allianceTotal = sumAllianceScore(state, bot.alliance);
    yield {
      type: 'park_score',
      botId: id,
      points: PARK_POINTS,
      alliance: bot.alliance,
      hexPos: hexCenter(bot.pos.col, bot.pos.row),
    };
    yield { type: 'score_update', alliance: bot.alliance, total: allianceTotal };
    yield { type: 'log', text: `${id} parks (+${PARK_POINTS} TAXI)`, kind: 'score' };
    yield { type: 'pause', ms: TIMING.parkScorePauseMs };
  }

  yield { type: 'pause', ms: TIMING.postParkMs };

  // -------- Defensive Set: pin adjacent hexes --------
  for (const id of BOT_IDS) {
    const bot = state.bots[id];
    if (bot.script !== 'defensive_set') continue;
    // Auto bonus: each drivetrain places one extra pin during auto.
    const pins = DRIVETRAINS[bot.drivetrain].blocks + 1;
    // Take the `pins` nearest-to-hub neighbours (excluding hub cells) so the
    // wall faces the contested ground rather than the back wall.
    const pinHexes = getNeighbors(bot.pos)
      .filter(n => !HUB_KEYS.has(hexKey(n)))
      .sort((a, b) => hexDist(a, HUB_CENTER) - hexDist(b, HUB_CENTER))
      .slice(0, pins);
    const pinPositions = pinHexes.map(h => hexCenter(h.col, h.row));
    yield {
      type: 'defensive_set',
      botId: id,
      alliance: bot.alliance,
      hexPos: hexCenter(bot.pos.col, bot.pos.row),
      blocks: pins,
      pinPositions,
    };
    yield { type: 'log', text: `${id} pins ${pins} hex${pins === 1 ? '' : 'es'}`, kind: bot.alliance };
    yield { type: 'pause', ms: TIMING.defensiveSetPauseMs };
  }

  yield { type: 'pause', ms: TIMING.postDefensiveMs };

  // -------- Shooting phase (initiative order) --------
  const shooters = BOT_IDS
    .map(id => state.bots[id])
    .filter(b => ['quick_score', 'triple_threat'].includes(b.script))
    .sort((a, b) => DRIVETRAINS[a.drivetrain].initiative - DRIVETRAINS[b.drivetrain].initiative);

  for (const bot of shooters) {
    if (bot.heldCargo === 0) {
      yield { type: 'log', text: `${bot.id} has no cargo to shoot`, kind: bot.alliance };
      continue;
    }
    const totalShots = bot.script === 'quick_score' ? 1 : bot.heldCargo;
    const steadied = bot.script === 'quick_score';
    const tag = bot.disrupted ? ' · DISRUPTED' : (steadied ? ' · steadied' : '');
    yield {
      type: 'log',
      text: `${bot.id} shoots ×${totalShots}${tag}`,
      kind: bot.alliance,
    };

    for (let i = 0; i < totalShots; i++) {
      const roll = rollShot(bot.scoring, { disrupted: bot.disrupted, steadied });
      const hexPos = hexCenter(bot.pos.col, bot.pos.row);

      // Bot rotates to face the hub before firing
      yield { type: 'face_hub', botId: bot.id };

      // Aim phase
      yield { type: 'shot_aim', botId: bot.id, hexPos };
      yield { type: 'pause', ms: TIMING.shotAimMs };

      // Consume cargo at ball release
      bot.heldCargo = Math.max(0, bot.heldCargo - 1);
      yield { type: 'cargo_consumed', botId: bot.id };
      yield { type: 'cargo_update', botId: bot.id, held: bot.heldCargo, max: bot.maxCargo };

      // Resolve
      bot.shotsTaken += 1;
      if (roll.hit) bot.points += SHOT_POINTS;
      const allianceTotal = sumAllianceScore(state, bot.alliance);

      yield {
        type: 'shot_resolve',
        botId: bot.id,
        hit: roll.hit,
        points: roll.hit ? SHOT_POINTS : 0,
        alliance: bot.alliance,
        hexPos,
      };

      if (roll.jammed) {
        yield {
          type: 'log',
          text: `${bot.id} JAMMED by disruptor — no shot`,
          kind: 'miss',
        };
      } else if (roll.hit) {
        yield { type: 'score_update', alliance: bot.alliance, total: allianceTotal };
        yield {
          type: 'log',
          text: `${bot.id} HIT — rolled ${rollDisplay(roll)} vs ${roll.accuracy}${roll.disrupted ? ' [DISRUPTED]' : ''}, +${SHOT_POINTS}`,
          kind: 'score',
        };
      } else {
        yield {
          type: 'log',
          text: `${bot.id} miss — rolled ${rollDisplay(roll)} vs ${roll.accuracy}${roll.disrupted ? ' [DISRUPTED]' : ''}`,
          kind: 'miss',
        };
      }
      yield { type: 'pause', ms: TIMING.shotBetweenMs };
    }
  }

  // -------- Final reveal --------
  yield { type: 'pause', ms: 500 };
  const redTotal = sumAllianceScore(state, 'red');
  const blueTotal = sumAllianceScore(state, 'blue');
  yield { type: 'log', text: `AUTON COMPLETE — RED ${redTotal} / BLUE ${blueTotal}`, kind: 'event' };
  yield { type: 'banner', text: `RED ${redTotal} · BLUE ${blueTotal}`, variant: 'small', duration: 1800 };
  yield { type: 'set_phase', phase: 'COMPLETE', sub: `FINAL · RED ${redTotal} BLUE ${blueTotal}`, isLive: false };
}

function sumAllianceScore(state, alliance) {
  return BOT_IDS
    .filter(id => state.bots[id].alliance === alliance)
    .reduce((sum, id) => sum + state.bots[id].points, 0);
}

// ============================================================
//  CHARGED UP — placement / charge auton
// ============================================================
//  Reuses the movement (planTick), the roll engine (rollShot), the
//  jam-target finder, and the existing event vocabulary (tick_move,
//  park_score for every +N popup, defensive_set, disruptor_fire,
//  score_update) — so no new renderer handlers are needed.
//
//  Script behaviours (from the challenge card):
//    cross_park    → charge station: climbers dock/engage (auto 8/12,
//                    balance per the rule), non-climbers leave community
//                    for mobility (+3)
//    quick_score   → 1 placement, steadied (one band sharper)
//    triple_threat → 2 placements if INTAKE ≥ 2, else 1 (normal accuracy)
//    defensive_set → pins (blocks + 1 in auto)
//    disruptor     → jams the enemy's best placer (its placement is
//                    knocked down DISRUPT_TIER_DROP tiers)
// ============================================================
async function* runPlacementAuton(state, card) {
  const mobilityPts = card.mobility.points;
  const dockAuto    = card.endgame.points.dock.auto;
  const engageAuto  = card.endgame.points.engage.auto;
  const cap         = card.endgame.capability;     // climb tier → 'none' | 'edge' | 'any'

  // Open grid nodes per alliance — a successful delivery drops a real
  // cone/cube onto the nearest open node of the carried kind.
  const openNodes = { red: [], blue: [] };
  for (const side of ['red', 'blue']) {
    (card.grid[side].cone || []).forEach(([c, r]) => openNodes[side].push({ col: c, row: r, kind: 'cone' }));
    (card.grid[side].cube || []).forEach(([c, r]) => openNodes[side].push({ col: c, row: r, kind: 'cube' }));
  }
  const takeNode = (bot, preferKind) => {
    const list = openNodes[bot.alliance];
    if (!list || list.length === 0) return null;
    const pool = preferKind ? list.filter(n => n.kind === preferKind) : list;
    const useList = pool.length ? pool : list;
    let best = useList[0], bd = Infinity;
    for (const n of useList) {
      const d = hexDist(bot.pos, { col: n.col, row: n.row });
      if (d < bd) { bd = d; best = n; }
    }
    list.splice(list.indexOf(best), 1);
    return best;
  };

  // Classify bots by script.
  const all       = BOT_IDS.map(id => state.bots[id]);
  const placers   = all.filter(b => b.script === 'quick_score' || b.script === 'triple_threat');
  const chargers  = all.filter(b => b.script === 'cross_park');
  const defenders = all.filter(b => b.script === 'defensive_set');
  const jammers   = all.filter(b => b.script === 'disruptor');
  const byInit    = (a, b) => DRIVETRAINS[a.drivetrain].initiative - DRIVETRAINS[b.drivetrain].initiative;
  const stayPut   = (b) => { b.target = { col: b.pos.col, row: b.pos.row }; };

  // Preload kind for each placer (alternating cone/cube).
  placers.forEach((b, i) => { b._carryKind = (i % 2 === 0) ? 'cone' : 'cube'; });

  // ---------- Reveal ----------
  for (const b of all) yield { type: 'cargo_update', botId: b.id, held: b.heldCargo, max: b.maxCargo };
  yield { type: 'log', text: 'Scripts revealed.', kind: 'event' };
  for (const b of all) yield { type: 'log', text: `${b.id} → ${SCRIPTS[b.script].label}`, kind: b.alliance };

  // ---------- Countdown ----------
  yield { type: 'set_phase', phase: 'AUTON', sub: 'STARTING', isLive: false };
  yield { type: 'banner', text: 'AUTON', variant: 'small', duration: TIMING.countdownNumberMs + 100 };
  yield { type: 'pause', ms: TIMING.countdownStepMs };
  for (const n of ['3', '2', '1']) {
    yield { type: 'banner', text: n, variant: 'big', duration: TIMING.countdownNumberMs };
    yield { type: 'pause', ms: TIMING.countdownStepMs };
  }
  yield { type: 'banner', text: 'GO!', variant: 'big', duration: TIMING.countdownNumberMs + 100 };
  yield { type: 'set_phase', phase: 'AUTON', sub: 'IN PROGRESS', isLive: true };
  yield { type: 'pause', ms: 450 };

  // ============================================================
  //  PHASE 1 — Deploy. Placers roll up to their own grid; chargers
  //  stage by the station; defenders take the enemy cycle lane;
  //  jammers cross over.
  // ============================================================
  for (const b of placers)   b.target = gridAdjacentTarget(b, card);
  for (const b of chargers)  b.target = chargeStaging(b, card);
  for (const b of defenders) b.target = defenseSpot(b);
  for (const b of jammers)   b.target = disruptorSpot(b);
  yield* moveLoop(state);
  yield { type: 'pause', ms: TIMING.postMovementMs };

  // ============================================================
  //  PHASE 2 — Disruptor jam (before deliveries so it shakes a score).
  // ============================================================
  for (const d of jammers) {
    const target = findDisruptorTarget(d, state);
    if (!target) { yield { type: 'log', text: `${d.id} jam — no opposing placers`, kind: 'event' }; continue; }
    yield { type: 'banner', text: `${d.id} · JAM`, variant: 'small', duration: TIMING.disruptorBannerMs };
    yield { type: 'pause', ms: 300 };
    target.disrupted = true;
    yield {
      type: 'disruptor_fire', sourceId: d.id, targetId: target.id,
      sourcePos: hexCenter(d.pos.col, d.pos.row), targetPos: hexCenter(target.pos.col, target.pos.row),
    };
    yield { type: 'log', text: `${d.id} jams ${target.id} — its next score is shaken`, kind: 'event' };
    yield { type: 'pause', ms: TIMING.disruptorPostMs };
  }
  if (jammers.length) yield { type: 'pause', ms: TIMING.postDisruptorMs };

  // ============================================================
  //  PHASE 3 — Deliver the preload. Quick Score is steadier.
  // ============================================================
  for (const bot of [...placers].sort(byInit)) {
    yield* deliverOne(state, card, bot, takeNode, { steadied: bot.script === 'quick_score', label: 'preload' });
  }

  // ============================================================
  //  PHASE 4 — Quick Score crosses the line (mobility); Triple Threat
  //  drives out for a second piece.
  // ============================================================
  for (const b of all) stayPut(b);
  const exiters  = placers.filter(b => b.script === 'quick_score');
  const fetchers = placers.filter(b => b.script === 'triple_threat' && b.maxCargo > 1);
  for (const b of exiters) b.target = mobilityExit(b);
  const claimed = [];
  for (const b of fetchers) {
    const piece = nearestFreePiece(b, state, claimed);
    if (piece) { b.target = { ...piece.pos }; claimed.push(piece.id); }
    else       { b.target = mobilityExit(b); }
  }
  if (exiters.length || fetchers.length) {
    yield* moveLoop(state, { pickups: true });
    yield { type: 'pause', ms: TIMING.postMovementMs };
  }
  for (const b of exiters) {
    if (!leftCommunity(b)) continue;
    b.points += mobilityPts;
    yield { type: 'park_score', botId: b.id, points: mobilityPts, alliance: b.alliance, hexPos: hexCenter(b.pos.col, b.pos.row) };
    yield { type: 'score_update', alliance: b.alliance, total: sumAllianceScore(state, b.alliance) };
    yield { type: 'log', text: `${b.id} crosses the line (+${mobilityPts} MOBILITY)`, kind: 'score' };
    yield { type: 'pause', ms: TIMING.parkScorePauseMs };
  }

  // ============================================================
  //  PHASE 5 — Triple Threat returns to the grid and delivers.
  // ============================================================
  for (const b of all) stayPut(b);
  const returners = fetchers.filter(b => b.heldCargo > 0);
  for (const b of returners) b.target = gridAdjacentTarget(b, card);
  if (returners.length) {
    yield* moveLoop(state);
    yield { type: 'pause', ms: TIMING.postMovementMs };
  }
  for (const bot of [...returners].sort(byInit)) {
    yield* deliverOne(state, card, bot, takeNode, { steadied: false, label: 'second piece' });
  }

  // ============================================================
  //  PHASE 6 — Charge. Triple Threat (done scoring) and Cross Park
  //  climb the station; bots that can't climb take mobility.
  // ============================================================
  for (const b of all) stayPut(b);
  const wantClimb = [...chargers, ...placers.filter(b => b.script === 'triple_threat')]
    .filter(b => cap[b.climber] && cap[b.climber] !== 'none');
  const parkOnly  = chargers.filter(b => !cap[b.climber] || cap[b.climber] === 'none');
  const eClimb = { red: 0, blue: 0 };
  for (const b of wantClimb) b.target = chargeApproach(b, card, eClimb);
  for (const b of parkOnly)  b.target = mobilityExit(b);
  if (wantClimb.length || parkOnly.length) {
    yield* moveLoop(state);
    yield { type: 'pause', ms: TIMING.postMovementMs };
  }
  for (const b of parkOnly) {
    if (!leftCommunity(b)) continue;
    b.points += mobilityPts;
    yield { type: 'park_score', botId: b.id, points: mobilityPts, alliance: b.alliance, hexPos: hexCenter(b.pos.col, b.pos.row) };
    yield { type: 'score_update', alliance: b.alliance, total: sumAllianceScore(state, b.alliance) };
    yield { type: 'log', text: `${b.id} crosses the line (+${mobilityPts} MOBILITY)`, kind: 'score' };
    yield { type: 'pause', ms: TIMING.parkScorePauseMs };
  }
  for (const alliance of ['red', 'blue']) {
    const climbers = wantClimb.filter(b => b.alliance === alliance);
    if (climbers.length === 0) continue;
    const engaged = climbers.length === 1 ? climbers[0].climber >= 3 : true;
    const pts = engaged ? engageAuto : dockAuto;
    const lbl = engaged ? 'ENGAGED' : 'DOCKED';
    yield { type: 'banner', text: `${alliance.toUpperCase()} CHARGE · ${lbl}`, variant: 'small', duration: TIMING.disruptorBannerMs };
    yield { type: 'pause', ms: 300 };
    for (const b of climbers) {
      b.points += pts;
      const dock = b._dockHex || b.pos;
      const dockXZ = hexCenter(dock.col, dock.row);
      yield {
        type: 'charge_dock', botId: b.id, engaged, alliance,
        col: dock.col, row: dock.row, x: dockXZ.x, z: dockXZ.z, points: pts,
      };
      yield { type: 'score_update', alliance, total: sumAllianceScore(state, alliance) };
      yield { type: 'log', text: `${b.id} ${lbl.toLowerCase()} on the charge station (+${pts})`, kind: 'score' };
      yield { type: 'pause', ms: TIMING.parkScorePauseMs };
    }
  }
  yield { type: 'pause', ms: TIMING.postParkMs };

  // ============================================================
  //  PHASE 7 — Defense. Pins go on the contested midfield lane only —
  //  never on a grid, alliance zone, or charge station.
  // ============================================================
  if (defenders.length) {
    const protect = new Set();
    for (const side of ['red', 'blue']) {
      [...card.grid[side].cone, ...card.grid[side].cube].forEach(([c, r]) => protect.add(`${c},${r}`));
      (card.allianceZone[side] || []).forEach(([c, r]) => protect.add(`${c},${r}`));
      [...card.chargeStation[side].edges, ...card.chargeStation[side].center].forEach(([c, r]) => protect.add(`${c},${r}`));
    }
    for (const bot of defenders) {
      const cand = [bot.pos, ...getNeighbors(bot.pos)]
        .filter(h => !protect.has(`${h.col},${h.row}`) && h.col >= 5 && h.col <= 10);
      const maxPins = Math.min(2, DRIVETRAINS[bot.drivetrain].blocks);
      const pinHexes = cand.slice(0, Math.max(1, maxPins));
      yield {
        type: 'defensive_set', botId: bot.id, alliance: bot.alliance,
        hexPos: hexCenter(bot.pos.col, bot.pos.row), blocks: pinHexes.length,
        pinPositions: pinHexes.map(h => hexCenter(h.col, h.row)),
      };
      yield { type: 'log', text: `${bot.id} contests the midfield lane (${pinHexes.length} pin${pinHexes.length === 1 ? '' : 's'})`, kind: bot.alliance };
      yield { type: 'pause', ms: TIMING.defensiveSetPauseMs };
    }
    yield { type: 'pause', ms: TIMING.postDefensiveMs };
  }

  // ---------- Final ----------
  yield { type: 'pause', ms: 500 };
  const redTotal = sumAllianceScore(state, 'red');
  const blueTotal = sumAllianceScore(state, 'blue');
  yield { type: 'log', text: `AUTON COMPLETE — RED ${redTotal} / BLUE ${blueTotal}`, kind: 'event' };
  yield { type: 'banner', text: `RED ${redTotal} · BLUE ${blueTotal}`, variant: 'small', duration: 1800 };
  yield { type: 'set_phase', phase: 'COMPLETE', sub: `FINAL · RED ${redTotal} BLUE ${blueTotal}`, isLive: false };
}

// ============================================================
//  Charged Up helpers
// ============================================================

/** Shared movement loop: advance every bot toward its .target until all arrive. */
function* moveLoop(state, opts = {}) {
  for (let tick = 0; tick < MAX_TICKS; tick++) {
    const moves = planTick(state);
    yield { type: 'tick_move', moves };
    for (const id of BOT_IDS) state.bots[id].pos = moves[id];
    if (opts.pickups) {
      const got = resolvePickups(state);
      for (const p of got) {
        const piece = state.pieces.find(pp => pp.id === p.pieceId);
        const kind = piece ? piece.kind : 'cone';
        const b = state.bots[p.botId];
        b._carryKind = kind;
        yield { type: 'pickup', botId: p.botId, pieceId: p.pieceId };
        yield { type: 'cargo_update', botId: p.botId, held: b.heldCargo, max: b.maxCargo };
        yield { type: 'log', text: `${p.botId} grabs a ${kind}`, kind: 'event' };
      }
    }
    if (allBotsAtTarget(state)) break;
  }
}

/** One delivery attempt: roll vs the score-stat accuracy, drop a real piece on a hit. */
async function* deliverOne(state, card, bot, takeNode, opts) {
  const steadied = !!opts.steadied;
  let acc = (steadied ? card.scoring.steadied : card.scoring.accuracy)[bot.scoring] ?? 50;
  if (bot.disrupted) acc = card.scoring.accuracy[Math.max(1, bot.scoring - 1)] ?? acc;   // jam: one stat-tier worse, never steadied
  const tier    = bot.scoring >= card.scoring.highMinScore ? 'L2' : 'L1';
  const pts     = tier === 'L2' ? card.scoring.points.high : card.scoring.points.mid;
  const kind    = bot._carryKind || 'cone';
  const tierLbl = tier === 'L2' ? 'HIGH' : 'MID';

  yield { type: 'pause', ms: TIMING.shotAimMs };       // reach-to-place beat
  const roll = 1 + Math.floor(Math.random() * 100);
  if (roll <= acc) {
    const node = takeNode(bot, kind);
    bot.points += pts;
    if (node) {
      const nodeXZ = hexCenter(node.col, node.row);
      const fromXZ = hexCenter(bot.pos.col, bot.pos.row);
      yield {
        type: 'place_piece', botId: bot.id, kind: node.kind, modelKey: card.models[node.kind],
        col: node.col, row: node.row, x: nodeXZ.x, z: nodeXZ.z, fromX: fromXZ.x, fromZ: fromXZ.z,
        tier, points: pts, alliance: bot.alliance,
      };
    } else {
      yield { type: 'park_score', botId: bot.id, points: pts, alliance: bot.alliance, hexPos: hexCenter(bot.pos.col, bot.pos.row) };
    }
    yield { type: 'score_update', alliance: bot.alliance, total: sumAllianceScore(state, bot.alliance) };
    yield { type: 'log', text: `${bot.id} scores a ${kind} ${tierLbl} (+${pts}) — ${roll} vs ${acc}%`, kind: 'score' };
  } else {
    yield { type: 'log', text: `${bot.id} misses (${opts.label}) — ${roll} vs ${acc}%${bot.disrupted ? ' · jammed' : ''}`, kind: 'miss' };
  }
  if (bot.heldCargo > 0) { bot.heldCargo -= 1; yield { type: 'cargo_update', botId: bot.id, held: bot.heldCargo, max: bot.maxCargo }; }
  bot._carryKind = null;
  bot.disrupted = false;     // jam consumed by this attempt
  yield { type: 'pause', ms: TIMING.shotBetweenMs };
}

/** Nearest untaken neutral piece not already claimed by another collector. */
function nearestFreePiece(bot, state, claimed) {
  const avail = state.pieces.filter(p => !p.taken && !claimed.includes(p.id));
  if (avail.length === 0) return null;
  avail.sort((a, b) => hexDist(bot.pos, a.pos) - hexDist(bot.pos, b.pos));
  return avail[0];
}

/** A community hex just IN FRONT of the bot's grid — deliver from adjacent, not on top of it. */
function gridAdjacentTarget(bot, card) {
  const isRed = bot.alliance === 'red';
  const nodes = [...card.grid[bot.alliance].cone, ...card.grid[bot.alliance].cube];
  let row = bot.pos.row, bd = Infinity;
  for (const [, r] of nodes) { const d = Math.abs(r - bot.pos.row); if (d < bd) { bd = d; row = r; } }
  return { col: isRed ? 2 : 12, row };
}

/** Staging hex in front of the charge station (used while approaching in Phase 1). */
function chargeStaging(bot, card) {
  const isRed = bot.alliance === 'red';
  const c = card.chargeStation[bot.alliance].center[0];
  return { col: isRed ? c[0] - 1 : c[0] + 1, row: c[1] };
}

/** Approach hex for the charge station (community side); stashes the dock hex to climb onto. */
function chargeApproach(bot, card, edgesUsed) {
  const isRed = bot.alliance === 'red';
  const side = bot.alliance;
  const cs = card.chargeStation[side];
  const reach = card.endgame.capability[bot.climber];
  let dock = null;
  if (reach === 'any')  dock = cs.center[0];
  else if (reach === 'edge') { dock = cs.edges[edgesUsed[side] % cs.edges.length]; edgesUsed[side] += 1; }
  if (dock) {
    bot._dockHex = { col: dock[0], row: dock[1] };
    return { col: isRed ? dock[0] - 1 : dock[0] + 1, row: dock[1] };
  }
  return mobilityExit(bot);
}

/** Defensive lane: cross to the ENEMY's cycle lane at midfield (never their zone/grid). */
function defenseSpot(bot) {
  const isRed = bot.alliance === 'red';
  return { col: isRed ? 9 : 5, row: 3 };
}

/** Disruptor crossing point — midfield on the enemy side. */
function disruptorSpot(bot) {
  const isRed = bot.alliance === 'red';
  return { col: isRed ? 9 : 5, row: isRed ? 1 : 5 };
}

/** A hex just outside the bot's own community (the mobility line). */
function mobilityExit(bot) {
  const isRed = bot.alliance === 'red';
  return { col: isRed ? 5 : 9, row: bot.pos.row };
}

/** Has the bot left its own community (crossed the mobility line)? */
function leftCommunity(bot) {
  return bot.alliance === 'red' ? bot.pos.col >= 5 : bot.pos.col <= 10;
}
