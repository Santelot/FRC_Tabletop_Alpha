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
//   { type: 'park_score', botId, points, alliance, hexPos, label? }
//   { type: 'defensive_set', botId, hexPos, blocks, pinPositions }
//   { type: 'disruptor_fire', sourceId, targetId, sourcePos, targetPos }
//   { type: 'face_hub', botId }                  — bot rotates to face hub
//   { type: 'shot_aim', botId, hexPos }
//   { type: 'shot_resolve', botId, hit, points, alliance, hexPos }
//   { type: 'cargo_consumed', botId }
//   { type: 'score_update', alliance, total }
//
//  v0.7 additions (Charged Up "broadcast cut" choreography):
//   { type: 'focus', x, z, zoom }                — camera cut ('close'|'mid'|'wide'|'home')
//   { type: 'face_point', botId, x, z }          — bot turns to face a world point
//   { type: 'carry_attach', botId, kind, modelKey } — piece visibly rides the bot
//   { type: 'carry_detach', botId }
//   { type: 'place_fumble', botId, kind, modelKey, x, z, towardX, towardZ }
//   { type: 'jam_clear', botId }                 — disrupted ring comes off
// ============================================================

import {
  BOT_IDS, SCRIPTS, SHOT_POINTS, PARK_POINTS, MAX_TICKS, DRIVETRAINS, ACTIVE_CHALLENGE,
} from '../config.js';
import { CHALLENGE_CARDS } from '../challenges.js';
import { RULES } from '../balance.js';
import { TIMING } from '../style.js';
import {
  planTarget, planTick, allBotsAtTarget, resolvePickups,
} from './planning.js';
import { rollShot, findDisruptorTarget, rollDisplay } from './shots.js';
import { hexCenter, getNeighbors, hexKey, HUB_KEYS, hexDist, HUB_CENTER, ROW_COUNTS, ROWS } from './hex.js';

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
    const b = state.bots[id];
    yield { type: 'log', text: `${id} → ${SCRIPTS[b.script].label}`, kind: b.alliance };
  }

  // -------- Countdown --------
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

  // RR carries are represented by the bots' glowing cargo indicators only —
  // no carried ball mesh (it doubled up with the indicators).
  yield { type: 'set_phase', phase: 'AUTON', sub: 'DEPLOY', isLive: true };

  // -------- Movement phase --------
  for (let tick = 0; tick < MAX_TICKS; tick++) {
    const moves = planTick(state);
    yield { type: 'tick_move', moves };

    // Apply moves to state after the renderer animates them
    for (const id of BOT_IDS) state.bots[id].pos = moves[id];

    // Resolve pickups
    const pickups = resolvePickups(state);
    for (const p of pickups) {
      yield { type: 'pickup', botId: p.botId, pieceId: p.pieceId, style: 'vanish' };
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

  if (disruptors.length) yield { type: 'set_phase', phase: 'AUTON', sub: 'DISRUPT', isLive: true };
  for (const d of disruptors) {
    const target = findDisruptorTarget(d, state);
    if (!target) {
      yield { type: 'log', text: `${d.id} disruptor has no opposing shooters to target`, kind: 'event' };
      continue;
    }

    const tPos = hexCenter(target.pos.col, target.pos.row);
    yield { type: 'focus', x: tPos.x, z: tPos.z, zoom: 'mid' };
    yield { type: 'banner', text: `${d.id} · DISRUPTOR`, variant: 'small', duration: TIMING.disruptorBannerMs };
    yield { type: 'pause', ms: 300 };

    target.disrupted = true;
    yield {
      type: 'disruptor_fire',
      sourceId: d.id,
      targetId: target.id,
      sourcePos: hexCenter(d.pos.col, d.pos.row),
      targetPos: tPos,
    };
    yield { type: 'log', text: `${d.id} DISRUPTS ${target.id} — opposing rolls take worse of two`, kind: 'event' };
    yield { type: 'pause', ms: TIMING.disruptorPostMs };
  }

  yield { type: 'pause', ms: TIMING.postDisruptorMs };

  // -------- Cross & Park scoring (gated by RULES.mobilityEnabled) --------
  if (RULES.mobilityEnabled && BOT_IDS.some(id => state.bots[id].script === 'cross_park')) {
    yield { type: 'focus', zoom: 'home', x: 0, z: 0 };
    yield { type: 'set_phase', phase: 'AUTON', sub: 'TAXI', isLive: true };
  }
  for (const id of BOT_IDS) {
    if (!RULES.mobilityEnabled) break;
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
  if (BOT_IDS.some(id => state.bots[id].script === 'defensive_set')) {
    yield { type: 'set_phase', phase: 'AUTON', sub: 'DEFENSE', isLive: true };
  }
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
  yield { type: 'set_phase', phase: 'AUTON', sub: 'SHOOTOUT', isLive: true };
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
    const shooterXZ = hexCenter(bot.pos.col, bot.pos.row);
    const hubXZ = hexCenter(HUB_CENTER.col, HUB_CENTER.row);
    // Frame the SHOT: midpoint bot↔hub at the tunable 'shot' zoom (style.js
    // CAMERA_DIRECTOR.zoom.shot) — shooter, ball flight, and hub all in view.
    // stageX/stageZ pin the floor spotlight to the SHOOTER, not the midpoint.
    yield {
      type: 'focus', zoom: 'shot',
      x: (shooterXZ.x + hubXZ.x) / 2, z: (shooterXZ.z + hubXZ.z) / 2,
      stageX: shooterXZ.x, stageZ: shooterXZ.z,
    };
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
  yield { type: 'focus', zoom: 'home', x: 0, z: 0 };
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
//  CHARGED UP — placement / charge auton (v5 "broadcast cut")
// ============================================================
//  Why v5 exists — what v4 got wrong:
//   • Placers drove AWAY from the grid (col 2/12) and pieces flew
//     2–3 hexes "telepathically". The start hexes are already nose-on
//     the grid, like a real CU auto — preloads now place from the start.
//   • The triple-threat divert made bots wander mid-cycle (now fully
//     isolated in planning.js for placement games).
//   • Defenders accidentally vacuumed neutral pieces crossing midfield
//     (now gated by state.pickupEligible).
//   • The charge approach could be an IMPASSABLE station hex → stuck
//     bots teleport-climbing (approach is now a verified passable hex).
//   • Carried pieces were invisible — the whole cycle was unreadable
//     (carry_attach/detach + place_fumble fix that).
//
//  Beat sheet:
//   A  JAM           disruptors zap the enemy's best placer from the start
//   B  PRELOADS      sequential, camera-in placement beats from the start hexes
//   C  BREAKOUT      everyone deploys at once (exit / fetch / lane / posts / staging)
//   D  MOBILITY      +mobility awards for bots that left the community
//   E  SECOND CYCLE  triple-threats return and deliver the fetched piece
//   F  CHARGE        docks assigned per the balance rule, sequential climb beats
//   G  DEFENSE       pins drop on the contested midfield lane
// ============================================================

async function* runPlacementAuton(state, card) {
  const mobilityPts = card.mobility.points;
  const dockAuto    = card.endgame.points.dock.auto;
  const engageAuto  = card.endgame.points.engage.auto;
  const cap         = card.endgame.capability;     // climb tier → 'none' | 'edge' | 'any'

  // Per-challenge script labels (scriptCopy override, base fallback)
  const scriptLabel = key => card.scriptCopy?.[key]?.label || SCRIPTS[key].label;

  // ---------- Solid hexes (grids + charge stations are impassable) ----------
  const solid = new Set();
  for (const side of ['red', 'blue']) {
    [...card.grid[side].cone, ...card.grid[side].cube]
      .forEach(([c, r]) => solid.add(`${c},${r}`));
    [...card.chargeStation[side].edges, ...card.chargeStation[side].center]
      .forEach(([c, r]) => solid.add(`${c},${r}`));
  }
  const isSolid = h => solid.has(`${h.col},${h.row}`);

  // ---------- Open grid nodes + reservation API ----------
  //  A node is `approachable` if a driving bot can stand next to it.
  //  Back-column cube nodes (e.g. red (0,1)) have NO passable neighbours,
  //  so drives prefer approachable nodes; preloads (placed from the start
  //  hex, no driving) just take the nearest.
  const openNodes = { red: [], blue: [] };
  for (const side of ['red', 'blue']) {
    (card.grid[side].cone || []).forEach(([c, r]) => openNodes[side].push({ col: c, row: r, kind: 'cone' }));
    (card.grid[side].cube || []).forEach(([c, r]) => openNodes[side].push({ col: c, row: r, kind: 'cube' }));
    for (const n of openNodes[side]) {
      n.approachable = getNeighbors({ col: n.col, row: n.row }).some(h => !isSolid(h));
    }
  }
  const nodes = {
    /** Reserve the best open node for this bot. opts.needApproach prefers drivable nodes. */
    take(bot, preferKind, opts = {}) {
      const list = openNodes[bot.alliance];
      if (!list || list.length === 0) return null;
      let pool = preferKind ? list.filter(n => n.kind === preferKind) : list;
      if (!pool.length) pool = list;
      if (opts.needApproach) {
        const reachable = pool.filter(n => n.approachable);
        if (reachable.length) pool = reachable;
      }
      let best = pool[0], bd = Infinity;
      for (const n of pool) {
        const d = hexDist(bot.pos, { col: n.col, row: n.row });
        if (d < bd) { bd = d; best = n; }
      }
      list.splice(list.indexOf(best), 1);
      return best;
    },
    /** A missed placement releases its node — the rack spot stays open. */
    release(bot, node) {
      if (node) openNodes[bot.alliance].push(node);
    },
  };

  /**
   * Nearest passable, UNOCCUPIED hex next to a node (dist-2 fallback for
   * walled-in spots). v1.6: a hex with a parked teammate standing on it is
   * not an approach — that exact case sent bots pacing in pockets and then
   * dropping their piece.
   */
  const approachFor = (node, bot, reserved) => {
    const occupied = new Set(
      BOT_IDS.filter(id => id !== bot.id).map(id => hexKey(state.bots[id].pos))
    );
    const ok = (h) => !isSolid(h) && !occupied.has(hexKey(h));
    let cands = getNeighbors(node).filter(ok);
    if (!cands.length) {
      const seen = new Set();
      for (const n1 of getNeighbors(node)) {
        for (const h of getNeighbors(n1)) {
          const k = `${h.col},${h.row}`;
          if (ok(h) && !seen.has(k)) { seen.add(k); cands.push(h); }
        }
      }
    }
    const free = cands.filter(h => !reserved.has(`${h.col},${h.row}`));
    const pool = free.length ? free : cands;
    if (!pool.length) return { col: bot.pos.col, row: bot.pos.row };
    pool.sort((a, b) => hexDist(bot.pos, a) - hexDist(bot.pos, b));
    reserved.add(`${pool[0].col},${pool[0].row}`);
    return { col: pool[0].col, row: pool[0].row };
  };

  // ---------- Classify bots by script ----------
  const all       = BOT_IDS.map(id => state.bots[id]);
  const placers   = all.filter(b => b.script === 'quick_score' || b.script === 'triple_threat');
  const chargers  = all.filter(b => b.script === 'cross_park');
  const defenders = all.filter(b => b.script === 'defensive_set');
  const jammers   = all.filter(b => b.script === 'disruptor');
  const byInit    = (a, b) => DRIVETRAINS[a.drivetrain].initiative - DRIVETRAINS[b.drivetrain].initiative;
  const stayPut   = (b) => { b.target = { col: b.pos.col, row: b.pos.row }; };
  const canClimb  = (b) => cap[b.climber] && cap[b.climber] !== 'none';

  // Preload kind for each placer (alternating cone/cube per alliance for variety).
  const preloadIdx = { red: 0, blue: 0 };
  placers.forEach(b => {
    b._carryKind = (preloadIdx[b.alliance]++ % 2 === 0) ? 'cone' : 'cube';
  });

  // ---------- Reveal ----------
  for (const b of all) yield { type: 'cargo_update', botId: b.id, held: b.heldCargo, max: b.maxCargo };
  yield { type: 'log', text: 'Scripts revealed.', kind: 'event' };
  for (const b of all) yield { type: 'log', text: `${b.id} → ${scriptLabel(b.script)}`, kind: b.alliance };

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

  // Preloads become visible on the placers' intakes.
  for (const b of placers) {
    yield { type: 'carry_attach', botId: b.id, kind: b._carryKind, modelKey: card.models[b._carryKind] };
  }
  yield { type: 'pause', ms: 300 };

  // ============================================================
  //  PHASE A — JAM. Disruptors zap the enemy's best placer right
  //  off the start — BEFORE the preload beats, so the jam actually
  //  shakes a score instead of arriving after the points are banked.
  // ============================================================
  for (const d of jammers) {
    const target = findDisruptorTarget(d, state);
    if (!target) { yield { type: 'log', text: `${d.id} jam — no opposing placers`, kind: 'event' }; continue; }
    const tPos = hexCenter(target.pos.col, target.pos.row);
    yield { type: 'focus', x: tPos.x, z: tPos.z, zoom: 'mid' };
    yield { type: 'banner', text: `${d.id} · JAM`, variant: 'small', duration: TIMING.disruptorBannerMs };
    yield { type: 'pause', ms: 300 };
    target.disrupted = true;
    yield {
      type: 'disruptor_fire', sourceId: d.id, targetId: target.id,
      sourcePos: hexCenter(d.pos.col, d.pos.row), targetPos: tPos,
    };
    yield { type: 'log', text: `${d.id} jams ${target.id} — its next placement is shaken`, kind: 'event' };
    yield { type: 'pause', ms: TIMING.disruptorPostMs };
  }
  if (jammers.length) yield { type: 'pause', ms: TIMING.postDisruptorMs };

  // ============================================================
  //  PHASE B — PRELOADS. Real CU bots start nose-on-grid, so the
  //  preload places straight from the start hex — no drive, no
  //  telepathic 3-hex arcs. Sequential beats in initiative order,
  //  camera in close. Quick Score (Place Preload) is steadied.
  // ============================================================
  yield { type: 'set_phase', phase: 'AUTON', sub: 'PRELOADS', isLive: true };
  for (const bot of [...placers].sort(byInit)) {
    yield* deliverOne(state, card, bot, nodes, {
      steadied: bot.script === 'quick_score', label: 'preload',
    });
  }

  // ============================================================
  //  PHASE C — BREAKOUT. The whole field moves at once:
  //   quick_score        → out of the community (mobility)
  //   triple_threat L2+  → reserved midfield piece (pickup-gated)
  //   triple_threat L1   → charge staging if it can climb, else exit
  //   defenders          → the enemy cycle lane (staggered rows)
  //   jammers            → harass posts on the enemy side
  //   chargers (climb)   → staging in front of their station
  //   chargers (no climb)→ out for mobility
  // ============================================================
  yield { type: 'focus', zoom: 'home', x: 0, z: 0 };
  yield { type: 'set_phase', phase: 'AUTON', sub: 'BREAKOUT', isLive: true };
  for (const b of all) stayPut(b);

  const usedExits = new Set();
  const exiters   = placers.filter(b => b.script === 'quick_score');
  const fetchers  = placers.filter(b => b.script === 'triple_threat' && b.maxCargo > 1);
  const ttIdle    = placers.filter(b => b.script === 'triple_threat' && b.maxCargo <= 1);

  for (const b of exiters) b.target = mobilityExit(b, usedExits);

  const claimed = [];
  for (const b of fetchers) {
    const piece = nearestFreePiece(b, state, claimed);
    if (piece) { b._piece = piece; b.target = { ...piece.pos }; claimed.push(piece.id); }
    else       { b.target = mobilityExit(b, usedExits); }
  }
  // Only the fetchers may pick pieces up — defenders/jammers crossing
  // midfield no longer vacuum cones by accident.
  state.pickupEligible = new Set(fetchers.map(b => b.id));

  const ttIdleClimb = ttIdle.filter(canClimb);
  const ttIdleExit  = ttIdle.filter(b => !canClimb(b));
  for (const b of ttIdleExit) b.target = mobilityExit(b, usedExits);

  defenders.forEach((b, i) => {
    const rows = [3, 1, 5];
    b.target = { col: b.alliance === 'red' ? 9 : 5, row: rows[i % rows.length] };
  });
  jammers.forEach((b, i) => {
    const rows = b.alliance === 'red' ? [1, 5] : [5, 1];
    b.target = { col: b.alliance === 'red' ? 10 : 4, row: rows[i % rows.length] };
  });

  const stagingRows = { red: [2, 3, 4], blue: [2, 3, 4] };
  const stagingIdx  = { red: 0, blue: 0 };
  const climbChargers = chargers.filter(canClimb);
  const parkOnly      = chargers.filter(b => !canClimb(b));
  for (const b of [...climbChargers, ...ttIdleClimb]) {
    const al = b.alliance;
    b.target = { col: al === 'red' ? 2 : 12, row: stagingRows[al][stagingIdx[al]++ % 3] };
  }
  for (const b of parkOnly) b.target = mobilityExit(b, usedExits);

  yield* moveLoop(state, { pickups: true, card, maxTicks: 14 });
  delete state.pickupEligible;
  yield { type: 'pause', ms: TIMING.postMovementMs };

  // ============================================================
  //  PHASE D — MOBILITY. +points for the scripts that earn it by
  //  leaving the community (quick_score exiters, non-climb bots).
  // ============================================================
  for (const b of [...exiters, ...ttIdleExit, ...parkOnly]) {
    if (!RULES.mobilityEnabled) break;
    if (!leftCommunity(b)) continue;
    b.points += mobilityPts;
    yield {
      type: 'park_score', botId: b.id, points: mobilityPts, alliance: b.alliance,
      hexPos: hexCenter(b.pos.col, b.pos.row), label: 'MOBILITY',
    };
    yield { type: 'score_update', alliance: b.alliance, total: sumAllianceScore(state, b.alliance) };
    yield { type: 'log', text: `${b.id} crosses the line (+${mobilityPts} MOBILITY)`, kind: 'score' };
    yield { type: 'pause', ms: TIMING.parkScorePauseMs };
  }

  // ============================================================
  //  PHASE E — SECOND CYCLE. Triple-threats that grabbed a piece
  //  reserve a drivable node FIRST, drive to a verified passable
  //  hex next to it, then deliver at base accuracy.
  // ============================================================
  const returners = fetchers.filter(b => b.heldCargo > 0);
  if (returners.length) {
    yield { type: 'focus', zoom: 'home', x: 0, z: 0 };   // wide for the drive
    yield { type: 'set_phase', phase: 'AUTON', sub: 'SECOND CYCLE', isLive: true };
    for (const b of all) stayPut(b);
    const reservedApproach = new Set();
    for (const b of returners) {
      const node = nodes.take(b, b._carryKind, { needApproach: true });
      b._node = node;
      b.target = node ? approachFor(node, b, reservedApproach)
                      : { col: b.alliance === 'red' ? 2 : 12, row: b.pos.row };
    }
    yield* moveLoop(state, { maxTicks: 14 });
    yield { type: 'pause', ms: TIMING.postMovementMs };
    for (const bot of [...returners].sort(byInit)) {
      yield* deliverOne(state, card, bot, nodes, {
        steadied: false, label: 'second piece', node: bot._node,
      });
      bot._node = null;
    }
  }

  // ============================================================
  //  PHASE F — CHARGE. Docks are assigned per the balance rule:
  //   1 climber  → center if CLIMB L3 (ENGAGED), else edge (DOCKED)
  //   2 climbers → both on edges → ENGAGED
  //   3+         → an L3 takes center, rest edges → ENGAGED
  //  Every bot drives to a verified PASSABLE approach hex beside its
  //  dock, then climbs in a sequential camera-in beat.
  // ============================================================
  const wantClimb = [...chargers, ...placers.filter(b => b.script === 'triple_threat')]
    .filter(canClimb);
  if (wantClimb.length) {
    yield { type: 'focus', zoom: 'home', x: 0, z: 0 };   // wide for the approach
    yield { type: 'set_phase', phase: 'AUTON', sub: 'CHARGE', isLive: true };
    for (const b of all) stayPut(b);
    const plans = {};
    const reservedApproach = new Set();

    for (const alliance of ['red', 'blue']) {
      const climbers = wantClimb.filter(b => b.alliance === alliance);
      if (!climbers.length) continue;
      const cs = card.chargeStation[alliance];
      const center = { col: cs.center[0][0], row: cs.center[0][1] };

      // ONE spot per bot, period: the station holds center + its edges and
      // nothing more. A bot with no free legal spot does not climb.
      const taken = new Set();
      const takeSpot = (bot, preferCenter) => {
        const legal = [];
        if (cap[bot.climber] === 'any') legal.push(center);
        for (const [c, r] of cs.edges) legal.push({ col: c, row: r });
        const free = legal.filter(h => !taken.has(`${h.col},${h.row}`));
        if (!free.length) return null;
        free.sort((a, b2) => {
          const ca = (a.col === center.col && a.row === center.row) ? 0 : 1;
          const cb = (b2.col === center.col && b2.row === center.row) ? 0 : 1;
          if (preferCenter && ca !== cb) return ca - cb;
          if (!preferCenter && ca !== cb) return cb - ca;
          return hexDist(bot.pos, a) - hexDist(bot.pos, b2);
        });
        const spot = free[0];
        taken.add(`${spot.col},${spot.row}`);
        return spot;
      };

      const anyCap = climbers.find(c => cap[c.climber] === 'any');
      for (const c of climbers) {
        const wantsCenter = climbers.length === 1 ? cap[c.climber] === 'any'
                          : climbers.length >= 3 && c === anyCap;
        c._dockHex = takeSpot(c, wantsCenter);
        if (c._dockHex) {
          c.target = approachFor(c._dockHex, c, reservedApproach);
        } else {
          stayPut(c);
        }
      }
      plans[alliance] = { climbers };
    }

    yield* moveLoop(state, { maxTicks: 14 });
    yield { type: 'pause', ms: TIMING.postMovementMs };

    for (const alliance of ['red', 'blue']) {
      const plan = plans[alliance];
      if (!plan) continue;

      // Only bots that ACTUALLY arrived next to their spot get to mount —
      // and the balance rule is judged on who really mounted, not the plan.
      const mounted = [];
      for (const c of plan.climbers) {
        if (!c._dockHex) {
          yield { type: 'log', text: `${c.id} finds no room on the charge station`, kind: 'miss' };
        } else if (hexDist(c.pos, c._dockHex) > 1) {
          yield { type: 'log', text: `${c.id} can't reach the charge station in time`, kind: 'miss' };
          c._dockHex = null;
        } else {
          mounted.push(c);
        }
      }
      if (!mounted.length) continue;

      const onCenter = (b) => {
        const cs2 = card.chargeStation[alliance];
        return b._dockHex.col === cs2.center[0][0] && b._dockHex.row === cs2.center[0][1];
      };
      let engaged;
      if (mounted.length === 1)      engaged = onCenter(mounted[0]);
      else if (mounted.length === 2) engaged = mounted.every(b => !onCenter(b));
      else                           engaged = true;

      const pts = engaged ? engageAuto : dockAuto;
      const lbl = engaged ? 'ENGAGED' : 'DOCKED';
      yield { type: 'banner', text: `${alliance.toUpperCase()} CHARGE · ${lbl}`, variant: 'small', duration: TIMING.disruptorBannerMs };
      yield { type: 'pause', ms: 300 };
      for (const b of mounted) {
        b.points += pts;
        const dock = b._dockHex;
        const dockXZ = hexCenter(dock.col, dock.row);
        yield { type: 'focus', x: dockXZ.x, z: dockXZ.z, zoom: 'close' };
        b.pos = { col: dock.col, row: dock.row };   // sim state matches the visual mount
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
  }

  // ============================================================
  //  PHASE G — DEFENSE. Pins go on the contested midfield lane only —
  //  never on a grid, alliance zone, or charge station. A stranded
  //  defender (boxed in mid-drive) still pins from wherever it stands.
  // ============================================================
  if (defenders.length) {
    yield { type: 'focus', zoom: 'home', x: 0, z: 0 };
    yield { type: 'set_phase', phase: 'AUTON', sub: 'DEFENSE', isLive: true };
    const protect = new Set();
    for (const side of ['red', 'blue']) {
      [...card.grid[side].cone, ...card.grid[side].cube].forEach(([c, r]) => protect.add(`${c},${r}`));
      (card.allianceZone[side] || []).forEach(([c, r]) => protect.add(`${c},${r}`));
      [...card.chargeStation[side].edges, ...card.chargeStation[side].center].forEach(([c, r]) => protect.add(`${c},${r}`));
    }
    for (const bot of defenders) {
      // Pins go on NEIGHBORING hexes only — a pin under the robot itself
      // read as two objects stacked on one hex.
      const occupied = new Set(BOT_IDS.map(id => hexKey(state.bots[id].pos)));
      let cand = getNeighbors(bot.pos)
        .filter(h => !protect.has(`${h.col},${h.row}`) && !occupied.has(hexKey(h))
                  && h.col >= 5 && h.col <= 10);
      if (!cand.length) {
        // stranded fallback — pin around us, never a protected/occupied hex
        cand = getNeighbors(bot.pos)
          .filter(h => !protect.has(`${h.col},${h.row}`) && !occupied.has(hexKey(h)));
      }
      const maxPins = Math.min(2, DRIVETRAINS[bot.drivetrain].blocks);
      const pinHexes = cand.slice(0, Math.max(1, maxPins));
      const botXZ = hexCenter(bot.pos.col, bot.pos.row);
      yield { type: 'focus', x: botXZ.x, z: botXZ.z, zoom: 'mid' };
      yield {
        type: 'defensive_set', botId: bot.id, alliance: bot.alliance,
        hexPos: botXZ, blocks: pinHexes.length,
        pinPositions: pinHexes.map(h => hexCenter(h.col, h.row)),
      };
      yield { type: 'log', text: `${bot.id} contests the midfield lane (${pinHexes.length} pin${pinHexes.length === 1 ? '' : 's'})`, kind: bot.alliance };
      yield { type: 'pause', ms: TIMING.defensiveSetPauseMs };
    }
    yield { type: 'pause', ms: TIMING.postDefensiveMs };
  }

  // ---------- Final ----------
  yield { type: 'focus', zoom: 'home', x: 0, z: 0 };
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
  const maxTicks = opts.maxTicks ?? MAX_TICKS;
  for (let tick = 0; tick < maxTicks; tick++) {
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
        if (opts.card) {
          yield { type: 'carry_attach', botId: p.botId, kind, modelKey: opts.card.models[kind] };
        }
        yield { type: 'cargo_update', botId: p.botId, held: b.heldCargo, max: b.maxCargo };
        yield { type: 'log', text: `${p.botId} grabs a ${kind}`, kind: 'event' };
      }
    }
    if (allBotsAtTarget(state)) break;
  }
}

/**
 * One placement attempt — the camera-in "beat":
 *   focus close on the bot → face the rack node → aim pause → roll.
 *   HIT  → carried piece detaches and arcs from the bot's ACTUAL position
 *          into the node.
 *   MISS → the piece fumbles onto the carpet (cargo spent, node released —
 *          the rack spot stays open for someone else).
 *  A jam knocks the roll one accuracy tier down and cancels steadied;
 *  it's consumed by this attempt (jam_clear pops the ring).
 */
async function* deliverOne(state, card, bot, nodes, opts) {
  const steadied = !!opts.steadied;
  const wasJammed = !!bot.disrupted;
  let acc = (steadied ? card.scoring.steadied : card.scoring.accuracy)[bot.scoring] ?? 50;
  if (wasJammed) acc = card.scoring.accuracy[Math.max(1, bot.scoring - 1)] ?? acc;   // jam: one stat-tier worse, never steadied
  const tier    = bot.scoring >= card.scoring.highMinScore ? 'L2' : 'L1';
  const pts     = tier === 'L2' ? card.scoring.points.high : card.scoring.points.mid;
  const kind    = bot._carryKind || 'cone';
  const tierLbl = tier === 'L2' ? 'HIGH' : 'MID';

  // Reserve the node up-front so the bot can FACE what it's scoring on.
  const node = opts.node !== undefined ? opts.node : nodes.take(bot, kind);
  const botXZ = hexCenter(bot.pos.col, bot.pos.row);

  yield { type: 'focus', x: botXZ.x, z: botXZ.z, zoom: 'close' };
  if (node) {
    const nodeXZ = hexCenter(node.col, node.row);
    yield { type: 'face_point', botId: bot.id, x: nodeXZ.x, z: nodeXZ.z };
  }
  yield { type: 'pause', ms: TIMING.shotAimMs };

  // PLACEMENT IS PHYSICAL: the bot must be standing next to its node.
  // No open node, or never reached the grid → the piece drops where it
  // stands. Zero points. (This is the board game's core manipulation rule.)
  const reachable = !!node && hexDist(bot.pos, node) <= 1;
  const roll = 1 + Math.floor(Math.random() * 100);
  if (!reachable) {
    if (node) nodes.release(bot, node);
    const toward = node ? hexCenter(node.col, node.row)
                        : { x: botXZ.x + (bot.alliance === 'red' ? -2 : 2), z: botXZ.z };
    yield { type: 'carry_detach', botId: bot.id };
    yield {
      type: 'place_fumble', botId: bot.id, kind, modelKey: card.models[kind],
      x: botXZ.x, z: botXZ.z, towardX: toward.x, towardZ: toward.z,
    };
    yield { type: 'log', text: `${bot.id} ${node ? "can't reach the grid" : 'finds no open node'} (${opts.label}) — drops the ${kind}`, kind: 'miss' };
  } else if (roll <= acc) {
    bot.points += pts;
    const nodeXZ = hexCenter(node.col, node.row);
    yield { type: 'carry_detach', botId: bot.id };
    yield {
      type: 'place_piece', botId: bot.id, kind: node.kind, modelKey: card.models[node.kind],
      col: node.col, row: node.row, x: nodeXZ.x, z: nodeXZ.z, fromX: botXZ.x, fromZ: botXZ.z,
      tier, points: pts, alliance: bot.alliance,
    };
    yield { type: 'score_update', alliance: bot.alliance, total: sumAllianceScore(state, bot.alliance) };
    yield { type: 'log', text: `${bot.id} scores a ${node.kind} ${tierLbl} (+${pts}) — ${roll} vs ${acc}%`, kind: 'score' };
  } else {
    // MISS — the node goes back on the open list; the piece hits the carpet.
    nodes.release(bot, node);
    const toward = hexCenter(node.col, node.row);
    yield { type: 'carry_detach', botId: bot.id };
    yield {
      type: 'place_fumble', botId: bot.id, kind, modelKey: card.models[kind],
      x: botXZ.x, z: botXZ.z, towardX: toward.x, towardZ: toward.z,
    };
    yield { type: 'log', text: `${bot.id} bobbles the ${kind} (${opts.label}) — ${roll} vs ${acc}%${wasJammed ? ' · jammed' : ''}`, kind: 'miss' };
  }

  if (bot.heldCargo > 0) {
    bot.heldCargo -= 1;
    yield { type: 'cargo_update', botId: bot.id, held: bot.heldCargo, max: bot.maxCargo };
  }
  bot._carryKind = null;
  if (wasJammed) {
    bot.disrupted = false;                       // jam consumed by this attempt
    yield { type: 'jam_clear', botId: bot.id };
  }
  yield { type: 'pause', ms: TIMING.shotBetweenMs };
}

/** Nearest untaken neutral piece not already claimed by another collector. */
function nearestFreePiece(bot, state, claimed) {
  const avail = state.pieces.filter(p => !p.taken && !claimed.includes(p.id));
  if (avail.length === 0) return null;
  avail.sort((a, b) => hexDist(bot.pos, a.pos) - hexDist(bot.pos, b.pos));
  return avail[0];
}

/** A hex just outside the bot's own community (the mobility line), de-duplicated. */
function mobilityExit(bot, used) {
  const col = bot.alliance === 'red' ? 5 : 9;
  const rows = [bot.pos.row, bot.pos.row + 1, bot.pos.row - 1, bot.pos.row + 2, bot.pos.row - 2];
  for (const r of rows) {
    if (r < 0 || r >= ROWS) continue;
    const c = Math.min(col, ROW_COUNTS[r] - 1);
    const k = `${c},${r}`;
    if (used && used.has(k)) continue;
    if (used) used.add(k);
    return { col: c, row: r };
  }
  return { col, row: bot.pos.row };
}

/** Has the bot left its own community (crossed the mobility line)? */
function leftCommunity(bot) {
  return bot.alliance === 'red' ? bot.pos.col >= 5 : bot.pos.col <= 10;
}
