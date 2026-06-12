// ============================================================
//  CAMERA DIRECTOR — broadcast-style cuts (NEW in v0.7)
// ============================================================
//  Flies the camera in on the action (placements, jams, climbs)
//  and back out to the active preset, like a broadcast operator
//  cutting between the wide and the tight shot.
//
//  Rules of engagement:
//   • Disabled entirely with CAMERA_DIRECTOR.enabled = false (style.js).
//   • Never hijacks the camera while the FREE ORBIT preset is active
//     (respectOrbit) — if you're driving, you keep the wheel.
//   • A new cue, a returnHome, or cancel() supersedes any in-flight
//     move (generation token), so cuts never fight each other.
//   • Frames the subject from the camera's CURRENT compass direction —
//     it pushes in rather than swinging around, which reads calm
//     instead of nauseating.
//
//  main.js calls director.cancel() whenever the user picks a camera
//  preset, so a manual view change always wins instantly.
// ============================================================

import * as THREE from 'three';
import { CAMERA_PRESETS } from '../config.js';
import { CAMERA_DIRECTOR } from '../style.js';

const easeInOut = t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

export class CameraDirector {
  constructor(scene) {
    this.scene = scene;
    this._gen = 0;        // generation token — bumping it aborts in-flight moves
    this.speed = 1;       // fast-forward multiplier (main.js sets this)
  }

  /** Cut in on a world point. zoom: 'close' | 'mid' | 'wide'. Fire-and-forget. */
  cue(pt, zoom = 'mid') {
    if (!this._allowed()) return;
    this._flyTo(this._frame(pt, zoom));
  }

  /** Fly back out to the user's active camera preset. */
  returnHome() {
    if (!this._allowed()) return;
    const p = CAMERA_PRESETS[this.scene._activePreset] || CAMERA_PRESETS.broadcast;
    this._flyTo({
      pos:  new THREE.Vector3(...p.position),
      look: new THREE.Vector3(...p.lookAt),
    });
  }

  /** Abort any in-flight move and hand the camera back (preset switches call this). */
  cancel() {
    this._gen++;
    if (this.scene.controls) this.scene.controls.enabled = true;
  }

  _allowed() {
    if (!CAMERA_DIRECTOR.enabled) return false;
    if (CAMERA_DIRECTOR.respectOrbit && this.scene._activePreset === 'orbit') return false;
    return true;
  }

  /**
   * Compute a camera position that frames `pt` at the requested zoom,
   * approaching along the camera's current compass bearing.
   */
  _frame(pt, zoom) {
    const z = CAMERA_DIRECTOR.zoom[zoom] || CAMERA_DIRECTOR.zoom.mid;
    const cam = this.scene.camera;
    const look = new THREE.Vector3(pt.x, 0, pt.z);

    const dir = new THREE.Vector3(cam.position.x - look.x, 0, cam.position.z - look.z);
    if (dir.lengthSq() < 0.001) dir.set(0, 0, 1);
    dir.normalize().multiplyScalar(z.dist);

    return {
      pos:  new THREE.Vector3(look.x + dir.x, z.height, look.z + dir.z),
      look,
    };
  }

  /**
   * Match-start establishing shot (v0.8): the camera begins high and
   * pulled back along the active preset's bearing, then glides down
   * into the preset — the "blimp to broadcast" cut. Resolves when the
   * flight lands (or immediately if the director is sidelined).
   */
  sweepIn() {
    if (!this._allowed()) return Promise.resolve();
    const p = CAMERA_PRESETS[this.scene._activePreset] || CAMERA_PRESETS.broadcast;
    const pos  = new THREE.Vector3(...p.position);
    const look = new THREE.Vector3(...p.lookAt);

    const start = pos.clone().multiplyScalar(1.45);
    start.y = pos.y * 2.1;
    this.scene.camera.position.copy(start);
    if (this.scene.controls) this.scene.controls.target.copy(look);
    this.scene.camera.lookAt(look);

    return this._flyTo({ pos, look }, CAMERA_DIRECTOR.moveMs * 2.2);
  }

  /** Flies the camera. Returns a promise that resolves on landing —
   *  or immediately if the flight is superseded, so awaits never hang. */
  _flyTo({ pos, look }, durMs) {
    const gen = ++this._gen;
    const cam = this.scene.camera;
    const ctl = this.scene.controls;

    const fromPos  = cam.position.clone();
    const fromLook = ctl ? ctl.target.clone() : new THREE.Vector3();
    if (ctl) ctl.enabled = false;                 // no user-drag fighting mid-flight

    const start = performance.now();
    const dur = (durMs ?? CAMERA_DIRECTOR.moveMs) / Math.max(0.25, this.speed || 1);
    const lk = new THREE.Vector3();

    return new Promise(resolve => {
      const step = (now) => {
        if (gen !== this._gen) { resolve(); return; }   // cancelled or superseded
        const t = Math.min((now - start) / dur, 1);
        const e = easeInOut(t);
        cam.position.lerpVectors(fromPos, pos, e);
        lk.lerpVectors(fromLook, look, e);
        if (ctl) { ctl.target.copy(lk); ctl.update(); }
        else cam.lookAt(lk);
        if (t < 1) requestAnimationFrame(step);
        else { if (ctl) ctl.enabled = true; resolve(); }
      };
      requestAnimationFrame(step);
    });
  }
}
