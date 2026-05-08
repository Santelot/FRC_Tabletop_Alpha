// ============================================================
//  AUTON ORCHESTRATOR
// ============================================================
//  An async generator that walks through the auton tick by tick,
//  yielding events that the renderer turns into Three.js animations.
//
//  Events yielded (with payload):
//   { type: 'log',           text, kind }
//   { type: 'banner',        text, variant ('big'|'small'), duration }
//   { type: 'set_phase',     phase, sub, isLive }
//   { type: 'pause',         ms }
//   { type: 'tick_move',     moves: { botId: {col,row} } }
//   { type: 'pickup',        botId, pieceId }
//   { type: 'park_score',    botId, points, alliance, hexPos }
//   { type: 'defensive_set', botId, hexPos, blocks }
//   { type: 'disruptor_fire', sourceId, targetId, sourcePos, targetPos }
//   { type: 'shot_aim',      botId, hexPos }
//   { type: 'shot_resolve',  botId, hit, points, alliance, hexPos }
//   { type: 'cargo_consumed', botId }
//   { type: 'score_update',  alliance, total }
//
//  Rendering is async (e.g. waiting for an animation tween to finish).
//  The renderer handles each event by returning a Promise; the generator
//  awaits before continuing. This way movement, pickups, shots all
//  play out at the right pace without explicit timing in the sim.
// ============================================================

import {
  BOT_IDS, SCRIPTS, SHOT_POINTS, PARK_POINTS, MAX_TICKS, DRIVETRAINS,
} from '../config.js';
import {
  planTarget, planTick, allBotsAtTarget, resolvePickups,
} from './planning.js';
import { rollShot, findDisruptorTarget, rollDisplay } from './shots.js';
import { hexCenter } from './hex.js';

/**
 * Run a full auton.
 *
 *   state: the game state object from buildGameState()
 *
 * Yields events in order. Caller must `await` between events for animations.
 */
export async function* runAuton(state) {
  // -------- Plan targets --------
  for (const id of BOT_IDS) {
    state.bots[id].target = planTarget(state.bots[id]);
  }

  // -------- Reveal scripts in the log --------
  yield { type: 'log', text: 'Scripts revealed.', kind: 'event' };
  for (const id of BOT_IDS) {
    const bot = state.bots[id];
    yield { type: 'log', text: `${id} → ${SCRIPTS[bot.script].label}`, kind: bot.alliance };
  }

  // -------- Countdown intro --------
  yield { type: 'set_phase', phase: 'AUTON', sub: 'STARTING', isLive: false };
  yield { type: 'banner', text: 'AUTON', variant: 'small', duration: 700 };
  yield { type: 'pause', ms: 520 };
  for (const n of ['3', '2', '1']) {
    yield { type: 'banner', text: n, variant: 'big', duration: 600 };
    yield { type: 'pause', ms: 560 };
  }
  yield { type: 'banner', text: 'GO!', variant: 'big', duration: 700 };
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
      yield { type: 'log', text: `${p.botId} picks up cargo`, kind: 'event' };
    }

    if (allBotsAtTarget(state)) break;
  }

  yield { type: 'pause', ms: 200 };

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

    yield { type: 'banner', text: `${d.id} · DISRUPTOR`, variant: 'small', duration: 900 };
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
    yield { type: 'pause', ms: 900 };
  }

  yield { type: 'pause', ms: 200 };

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
    yield { type: 'pause', ms: 280 };
  }

  yield { type: 'pause', ms: 200 };

  // -------- Defensive Set auras --------
  for (const id of BOT_IDS) {
    const bot = state.bots[id];
    if (bot.script !== 'defensive_set') continue;
    const blocks = DRIVETRAINS[bot.drivetrain].blocks;
    yield {
      type: 'defensive_set',
      botId: id,
      hexPos: hexCenter(bot.pos.col, bot.pos.row),
      blocks,
    };
    yield { type: 'log', text: `${id} sets ${blocks}-hex defense`, kind: bot.alliance };
    yield { type: 'pause', ms: 220 };
  }

  yield { type: 'pause', ms: 200 };

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
    // Quick Score = 1 shot max; Triple Threat fires whatever's loaded (≤2)
    const totalShots = bot.script === 'quick_score' ? 1 : bot.heldCargo;
    yield {
      type: 'log',
      text: `${bot.id} shoots (×${totalShots}, ${bot.scoring === 1 ? 50 : bot.scoring === 2 ? 75 : 90}%${bot.disrupted ? ' DISRUPTED' : ''})`,
      kind: bot.alliance,
    };

    for (let i = 0; i < totalShots; i++) {
      const roll = rollShot(bot.scoring, bot.disrupted);
      const hexPos = hexCenter(bot.pos.col, bot.pos.row);

      // Aim phase
      yield { type: 'shot_aim', botId: bot.id, hexPos };
      yield { type: 'pause', ms: 380 };

      // Consume cargo at ball release
      bot.heldCargo = Math.max(0, bot.heldCargo - 1);
      yield { type: 'cargo_consumed', botId: bot.id };

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

      if (roll.hit) {
        yield { type: 'score_update', alliance: bot.alliance, total: allianceTotal };
        yield {
          type: 'log',
          text: `${bot.id} HIT — rolled ${rollDisplay(roll)} vs ${roll.accuracy}${bot.disrupted ? ' [DISRUPTED]' : ''}, +${SHOT_POINTS}`,
          kind: 'score',
        };
      } else {
        yield {
          type: 'log',
          text: `${bot.id} miss — rolled ${rollDisplay(roll)} vs ${roll.accuracy}${bot.disrupted ? ' [DISRUPTED]' : ''}`,
          kind: 'miss',
        };
      }
      yield { type: 'pause', ms: 250 };
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
