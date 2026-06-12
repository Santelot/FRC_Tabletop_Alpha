// ============================================================
//  ARENA — stadium dressing around the field (NEW in v0.8)
// ============================================================
//  Three systems, all tuned via the ARENA block in style.js:
//
//   1. LED RIBBON — an emissive light strip around the field rim.
//      Idles with a slow gold "breath"; every score_update pulses it
//      in the scoring alliance's color (bloom makes it sing).
//   2. CORNER PYLONS — four glowing posts that frame the arena and
//      give the camera sweeps something to fly past.
//   3. STAGE LIGHT — a soft spotlight disc that glides to wherever
//      the broadcast is looking (driven by the same `focus` events
//      as the camera director). When the camera goes home, it fades.
//
//  Everything is emissive geometry — zero extra lights, so the
//  framerate cost is just a handful of boxes. ARENA.enabled = false
//  removes the whole thing.
// ============================================================

import * as THREE from 'three';
import { FIELD_W, FIELD_D } from '../sim/hex.js';
import { ARENA } from '../style.js';

const easeOut = t => 1 - Math.pow(1 - t, 3);

/**
 * Build the arena into the given Scene wrapper (needs .scene + .onTick).
 * Returns { group, pulse(alliance), setStage(x, z, visible), dispose() }
 * or null when ARENA.enabled is false.
 */
export function buildArena(sceneWrapper) {
  if (!ARENA.enabled) return null;
  const group = new THREE.Group();
  group.name = 'arena';

  const halfW = FIELD_W / 2 + ARENA.margin;
  const halfD = FIELD_D / 2 + ARENA.margin;

  // ---------------------------------------------------------
  //  LED ribbon — one shared material so a single pulse hits
  //  all four strips at once.
  // ---------------------------------------------------------
  const led = ARENA.led;
  const ledMat = new THREE.MeshStandardMaterial({
    color: 0x101116,
    emissive: new THREE.Color(led.baseColor),
    emissiveIntensity: led.baseIntensity,
    metalness: 0.2,
    roughness: 0.6,
  });
  const strip = (w, d, x, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, led.height, d), ledMat);
    m.position.set(x, led.height / 2, z);
    group.add(m);
  };
  strip(halfW * 2 + led.thickness * 2, led.thickness, 0, -halfD);  // far
  strip(halfW * 2 + led.thickness * 2, led.thickness, 0,  halfD);  // near
  strip(led.thickness, halfD * 2, -halfW, 0);                      // left
  strip(led.thickness, halfD * 2,  halfW, 0);                      // right

  // ---------------------------------------------------------
  //  Corner pylons
  // ---------------------------------------------------------
  if (ARENA.pylons.enabled) {
    const py = ARENA.pylons;
    const pyMat = new THREE.MeshStandardMaterial({
      color: 0x14151c,
      emissive: new THREE.Color(py.color),
      emissiveIntensity: py.intensity,
      metalness: 0.3,
      roughness: 0.5,
    });
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const post = new THREE.Mesh(
        new THREE.BoxGeometry(0.32, py.height, 0.32), pyMat,
      );
      post.position.set(sx * (halfW + 0.45), py.height / 2, sz * (halfD + 0.45));
      group.add(post);
      const cap = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.14, 0.5), ledMat,   // caps ride the LED pulse
      );
      cap.position.set(post.position.x, py.height + 0.07, post.position.z);
      group.add(cap);
    }
  }

  // ---------------------------------------------------------
  //  Stage light — the broadcast's "where to look" disc
  // ---------------------------------------------------------
  let stage = null;
  if (ARENA.stage.enabled) {
    const st = ARENA.stage;
    stage = new THREE.Group();
    stage.name = 'stage-light';
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(st.radius, 40),
      new THREE.MeshBasicMaterial({
        color: st.color, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }),
    );
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.03;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(st.radius * 0.9, st.radius, 48),
      new THREE.MeshBasicMaterial({
        color: st.color, transparent: true, opacity: 0,
        side: THREE.DoubleSide, depthWrite: false,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.04;
    stage.add(disc, ring);
    stage.visible = false;
    stage.userData = { disc, ring, on: false, gen: 0 };
    group.add(stage);
  }

  sceneWrapper.scene.add(group);

  // ---------------------------------------------------------
  //  Idle breath + pulse decay (one per-frame hook)
  // ---------------------------------------------------------
  let t = 0;
  let boost = 0;                       // raised by pulse(), decays each frame
  let colorTimer = null;
  const baseColor = new THREE.Color(led.baseColor);
  const unTick = sceneWrapper.onTick(dt => {
    t += dt;
    boost *= Math.pow(0.04, dt);       // fast exponential decay
    ledMat.emissiveIntensity =
      led.baseIntensity * (1 + led.breath * Math.sin(t * 1.6)) + boost;
    if (stage && stage.userData.on) {
      stage.userData.ring.rotation.z += dt * 0.9;   // lazy ring spin
    }
  });

  /** Flash the ribbon in an alliance color, then settle back to gold. */
  function pulse(alliance) {
    ledMat.emissive.setHex(alliance === 'red' ? led.red : led.blue);
    boost = led.pulseBoost;
    if (colorTimer) clearTimeout(colorTimer);
    colorTimer = setTimeout(() => ledMat.emissive.copy(baseColor), 620);
  }

  /** Glide the stage light to (x,z) and fade it in — or fade it out. */
  function setStage(x, z, visible) {
    if (!stage) return;
    const ud = stage.userData;
    const gen = ++ud.gen;
    const st = ARENA.stage;

    const fromX = stage.position.x, fromZ = stage.position.z;
    const fromDisc = ud.disc.material.opacity;
    const fromRing = ud.ring.material.opacity;
    const toDisc = visible ? st.opacity : 0;
    const toRing = visible ? st.opacity * 2.6 : 0;
    if (visible) { stage.visible = true; ud.on = true; }
    if (visible && !fromDisc) { stage.position.set(x, 0, z); }   // appear in place, don't slide from afar

    const start = performance.now();
    const dur = 280;
    const step = (now) => {
      if (gen !== ud.gen) return;
      const e = easeOut(Math.min((now - start) / dur, 1));
      if (visible) {
        stage.position.x = fromX + (x - fromX) * e;
        stage.position.z = fromZ + (z - fromZ) * e;
      }
      ud.disc.material.opacity = fromDisc + (toDisc - fromDisc) * e;
      ud.ring.material.opacity = fromRing + (toRing - fromRing) * e;
      if (e < 1) requestAnimationFrame(step);
      else if (!visible) { stage.visible = false; ud.on = false; }
    };
    requestAnimationFrame(step);
  }

  function dispose() {
    unTick();
    if (colorTimer) clearTimeout(colorTimer);
    sceneWrapper.scene.remove(group);
  }

  return { group, pulse, setStage, dispose };
}
