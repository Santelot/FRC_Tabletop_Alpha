// ============================================================
//  THREE.JS SCENE — scaffold
// ============================================================
//  Owns the renderer, camera, lights, ground plane, and animation loop.
//  Other render modules (field, bots, pieces, effects) add their objects
//  to scene.scene.
// ============================================================

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CAMERA_PRESETS, LIGHTING } from '../config.js';
import { FIELD_W, FIELD_D } from '../sim/hex.js';

export class Scene {
  constructor(canvas) {
    this.canvas = canvas;
    this._tickers = [];        // functions called every frame
    this._init();
  }

  _init() {
    // ---- Renderer ----
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight, false);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;

    // ---- Scene ----
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1f2025);
    this.scene.fog = new THREE.Fog(0x1f2025, 35, 80);

    // ---- Camera ----
    const aspect = this.canvas.clientWidth / Math.max(1, this.canvas.clientHeight);
    this.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 200);
    this._applyCamera('broadcast');

    // ---- Lights ----
    const L = LIGHTING;

    this.ambient = new THREE.AmbientLight(L.ambient.color, L.ambient.intensity);
    this.scene.add(this.ambient);

    this.hemi = new THREE.HemisphereLight(L.hemisphere.skyColor, L.hemisphere.groundColor, L.hemisphere.intensity);
    this.scene.add(this.hemi);

    this.keyLight = new THREE.DirectionalLight(L.keyLight.color, L.keyLight.intensity);
    this.keyLight.position.set(...L.keyLight.position);
    this.keyLight.castShadow = L.keyLight.castShadow;
    // Tune shadow camera to cover the field tightly for sharp shadows
    const halfSpan = Math.max(FIELD_W, FIELD_D) * 0.6;
    this.keyLight.shadow.camera.left = -halfSpan;
    this.keyLight.shadow.camera.right = halfSpan;
    this.keyLight.shadow.camera.top = halfSpan;
    this.keyLight.shadow.camera.bottom = -halfSpan;
    this.keyLight.shadow.camera.near = 1;
    this.keyLight.shadow.camera.far = 60;
    this.keyLight.shadow.mapSize.set(2048, 2048);
    this.keyLight.shadow.bias = -0.0005;
    this.scene.add(this.keyLight);

    this.fillLight = new THREE.DirectionalLight(L.fillLight.color, L.fillLight.intensity);
    this.fillLight.position.set(...L.fillLight.position);
    this.scene.add(this.fillLight);

    this.hubGlow = new THREE.PointLight(L.hubGlow.color, L.hubGlow.intensity, L.hubGlow.distance, 2);
    this.hubGlow.position.set(...L.hubGlow.position);
    this.scene.add(this.hubGlow);

    // ---- Ground (placeholder; field model goes on top) ----
    const groundGeo = new THREE.PlaneGeometry(FIELD_W * 1.6, FIELD_D * 2.0);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x2c2d34,
      roughness: 0.95,
      metalness: 0.0,
    });
    this.ground = new THREE.Mesh(groundGeo, groundMat);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.y = -0.01; // sits just below 0 so hex grid doesn't z-fight
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);

    // ---- Orbit controls ----
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.target.set(0, 0, 0);
    this.controls.minDistance = 8;
    this.controls.maxDistance = 60;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.05; // don't go below ground
    this.controls.update();

    // ---- Resize handler ----
    this._onResize = this._onResize.bind(this);
    window.addEventListener('resize', this._onResize);
    this._onResize();

    // ---- Animation loop ----
    this._clock = new THREE.Clock();
    this._loop = this._loop.bind(this);
    this.renderer.setAnimationLoop(this._loop);
  }

  _onResize() {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }

  _applyCamera(presetName) {
    const p = CAMERA_PRESETS[presetName];
    if (!p) return;
    this.camera.position.set(...p.position);
    this.camera.lookAt(...p.lookAt);
    this.camera.fov = p.fov;
    this.camera.updateProjectionMatrix();
    if (this.controls) {
      this.controls.target.set(...p.lookAt);
      this.controls.update();
    }
    this._activePreset = presetName;
  }

  setCameraPreset(presetName) {
    this._applyCamera(presetName);
    // Disable orbit drag for fixed presets (broadcast, topdown), enable for orbit
    if (this.controls) {
      this.controls.enableRotate = presetName === 'orbit';
    }
  }

  /** Register a per-frame callback. Returns an unregister function. */
  onTick(fn) {
    this._tickers.push(fn);
    return () => {
      const i = this._tickers.indexOf(fn);
      if (i >= 0) this._tickers.splice(i, 1);
    };
  }

  _loop() {
    const dt = this._clock.getDelta();
    if (this.controls) this.controls.update();
    for (const fn of this._tickers) fn(dt);
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    window.removeEventListener('resize', this._onResize);
    this.renderer.setAnimationLoop(null);
    this.renderer.dispose();
  }
}
