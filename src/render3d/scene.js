// ============================================================
//  THREE.JS SCENE — scaffold
// ============================================================
//  Owns the renderer, camera, lights, ground plane, animation loop,
//  fog, and the visible hub glow halo sprite.
// ============================================================

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CAMERA_PRESETS, LIGHTING } from '../config.js';
import { ATMOSPHERE, HUB_GLOW_HALO } from '../style.js';
import { FIELD_W, FIELD_D, hexCenter, HUB_CENTER } from '../sim/hex.js';
import { getFieldLineMaterials } from './field.js';

export class Scene {
  constructor(canvas) {
    this.canvas = canvas;
    this._tickers = [];
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

    // ---- Scene + atmosphere ----
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(ATMOSPHERE.backgroundColor);
    if (ATMOSPHERE.fog.enabled) {
      this.scene.fog = new THREE.Fog(
        ATMOSPHERE.fog.color, ATMOSPHERE.fog.near, ATMOSPHERE.fog.far,
      );
    }

    // ---- Camera ----
    const aspect = this.canvas.clientWidth / Math.max(1, this.canvas.clientHeight);
    this.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 200);
    this._applyCamera('broadcast');

    // ---- Lights ----
    const L = LIGHTING;

    this.ambient = new THREE.AmbientLight(L.ambient.color, L.ambient.intensity);
    this.scene.add(this.ambient);

    this.hemi = new THREE.HemisphereLight(
      L.hemisphere.skyColor, L.hemisphere.groundColor, L.hemisphere.intensity,
    );
    this.scene.add(this.hemi);

    this.keyLight = new THREE.DirectionalLight(L.keyLight.color, L.keyLight.intensity);
    this.keyLight.position.set(...L.keyLight.position);
    this.keyLight.castShadow = L.keyLight.castShadow;
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

    this.hubGlow = new THREE.PointLight(
      L.hubGlow.color, L.hubGlow.intensity, L.hubGlow.distance, 2,
    );
    const hubXZ = hexCenter(HUB_CENTER.col, HUB_CENTER.row);
    this.hubGlow.position.set(hubXZ.x, L.hubGlow.position[1], hubXZ.z);
    this.scene.add(this.hubGlow);

    // ---- Hub glow halo (visible sprite, makes the hub itself glow) ----
    if (HUB_GLOW_HALO.enabled) {
      this._buildHubGlowHalo();
    }

    // ---- Ground ----
    if (ATMOSPHERE.ground.enabled) {
      const groundGeo = new THREE.PlaneGeometry(FIELD_W * 1.6, FIELD_D * 2.0);
      const groundMat = new THREE.MeshStandardMaterial({
        color: ATMOSPHERE.ground.color,
        roughness: ATMOSPHERE.ground.roughness,
        metalness: 0.0,
      });
      this.ground = new THREE.Mesh(groundGeo, groundMat);
      this.ground.rotation.x = -Math.PI / 2;
      this.ground.position.y = -0.01;
      this.ground.receiveShadow = true;
      this.scene.add(this.ground);
    }

    // ---- Orbit controls ----
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.target.set(0, 0, 0);
    this.controls.minDistance = 8;
    this.controls.maxDistance = 60;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.05;
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

  _buildHubGlowHalo() {
    const cfg = HUB_GLOW_HALO;
    const hubXZ = hexCenter(HUB_CENTER.col, HUB_CENTER.row);
    const haloGroup = new THREE.Group();
    haloGroup.name = 'hub-halo';
    haloGroup.position.set(hubXZ.x, cfg.yPosition, hubXZ.z);

    // Use a texture-free approach: build a soft radial gradient via canvas
    const makeSpriteMaterial = (color, opacity) => {
      const c = document.createElement('canvas');
      c.width = c.height = 256;
      const ctx = c.getContext('2d');
      const grad = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
      const hex = '#' + color.toString(16).padStart(6, '0');
      grad.addColorStop(0,   hex + 'ff');
      grad.addColorStop(0.4, hex + '99');
      grad.addColorStop(1,   hex + '00');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 256, 256);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      return new THREE.SpriteMaterial({
        map: tex,
        transparent: true,
        opacity,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
    };

    // Inner halo
    const innerMat = makeSpriteMaterial(cfg.innerColor, cfg.innerOpacity);
    const inner = new THREE.Sprite(innerMat);
    inner.scale.setScalar(cfg.innerRadius * 2);
    haloGroup.add(inner);

    // Outer halo
    const outerMat = makeSpriteMaterial(cfg.outerColor, cfg.outerOpacity);
    const outer = new THREE.Sprite(outerMat);
    outer.scale.setScalar(cfg.outerRadius * 2);
    haloGroup.add(outer);

    this.scene.add(haloGroup);
    this.hubHalo = { group: haloGroup, innerMat, outerMat,
                     baseInner: cfg.innerOpacity, baseOuter: cfg.outerOpacity };

    // Pulse via tick callback
    if (cfg.pulseRate > 0) {
      let t = 0;
      this.onTick(dt => {
        t += dt;
        const phase = Math.sin(t * cfg.pulseRate * Math.PI * 2);
        const factor = 1 - cfg.pulseDepth * (0.5 - 0.5 * phase);
        innerMat.opacity = cfg.innerOpacity * factor;
        outerMat.opacity = cfg.outerOpacity * factor;
      });
    }
  }

  _onResize() {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();

    // Line2 needs to know the screen resolution
    const lineMats = getFieldLineMaterials();
    for (const m of lineMats) m.resolution.set(w, h);
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

  /** Boost the hub halo (called on a successful shot for emphasis). */
  flashHubHalo() {
    if (!this.hubHalo) return;
    const { innerMat, outerMat, baseInner, baseOuter } = this.hubHalo;
    const start = performance.now();
    const dur = 700;
    const step = () => {
      const t = Math.min((performance.now() - start) / dur, 1);
      // Quick spike then return
      const spike = t < 0.2 ? t / 0.2 : (1 - t) / 0.8;
      innerMat.opacity = baseInner + spike * 0.5;
      outerMat.opacity = baseOuter + spike * 0.4;
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
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
