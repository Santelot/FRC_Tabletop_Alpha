// ============================================================
//  MODEL LOADER
// ============================================================
//  Loads .glb files asynchronously, applies the per-model transforms
//  from config.js (position offset, rotation, scale), and falls back
//  to a colored placeholder if the file isn't there.
//
//  Returns Three.js Object3D (a Group) — the OUTER group has its
//  origin at (0,0,0); the INNER mesh has the corrective transforms.
//  This way, code that places a bot at hex (col, row) just sets
//  group.position.set(x, 0, z) and never has to know about offsets.
// ============================================================

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MODEL_PATHS, MODEL_TRANSFORMS } from '../config.js';

const loader = new GLTFLoader();
const cache = new Map();  // modelKey → cloned-source Object3D

/**
 * Load a model by key (e.g. 'bot_tank'). Returns a fresh Group whose
 * outer transform is identity, with corrective transforms applied to
 * the inner loaded mesh.
 *
 * If the .glb file fails to load (404, parse error), returns a placeholder
 * primitive sized appropriately so the rest of the code keeps working.
 */
export async function loadModel(modelKey, placeholderOpts = {}) {
  const path = MODEL_PATHS[modelKey];
  const transform = MODEL_TRANSFORMS[modelKey] || { position: [0,0,0], rotation: [0,0,0], scale: 1.0 };

  // Try cache first
  if (cache.has(modelKey)) {
    return wrapAndTransform(cache.get(modelKey).clone(true), transform);
  }

  // Try to load the file
  let inner;
  try {
    const gltf = await loader.loadAsync(path);
    inner = gltf.scene;
    cache.set(modelKey, inner.clone(true));

    // Enable shadows on all meshes
    inner.traverse(obj => {
      if (obj.isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });
  } catch (err) {
    console.warn(`[loader] Could not load ${path}, using placeholder:`, err.message);
    inner = makePlaceholder(modelKey, placeholderOpts);
  }

  return wrapAndTransform(inner, transform);
}

function wrapAndTransform(inner, transform) {
  // Outer group keeps a clean (0,0,0) origin for placement code
  const outer = new THREE.Group();

  // Apply per-model transforms to the INNER mesh
  const pos = transform.position || [0, 0, 0];
  const rot = transform.rotation || [0, 0, 0];
  const scl = transform.scale ?? 1.0;

  inner.position.set(pos[0], pos[1], pos[2]);
  inner.rotation.set(
    THREE.MathUtils.degToRad(rot[0]),
    THREE.MathUtils.degToRad(rot[1]),
    THREE.MathUtils.degToRad(rot[2]),
  );

  if (typeof scl === 'number') {
    inner.scale.setScalar(scl);
  } else {
    inner.scale.set(scl[0], scl[1], scl[2]);
  }

  outer.add(inner);
  return outer;
}

// ============================================================
//  PLACEHOLDERS — used when a .glb file is missing
// ============================================================
//  Distinct shapes per model type so missing files are obvious at a
//  glance. Sized to roughly the right scale so layout looks correct.

function makePlaceholder(modelKey, opts = {}) {
  const group = new THREE.Group();

  if (modelKey === 'field') {
    // Big flat carpet rectangle
    const geo = new THREE.BoxGeometry(35, 0.05, 18);
    const mat = new THREE.MeshStandardMaterial({ color: 0x2c2d34, roughness: 0.95 });
    const m = new THREE.Mesh(geo, mat);
    m.position.y = -0.025;
    m.receiveShadow = true;
    group.add(m);

  } else if (modelKey === 'hub') {
    // Stepped gold tower
    const colors = [0xb57500, 0xffb627, 0xffd15c, 0xffe9a8];
    const heights = [0, 0.4, 0.9, 1.5];
    const radii = [3.2, 2.4, 1.6, 0.8];
    for (let i = 0; i < heights.length; i++) {
      const geo = new THREE.CylinderGeometry(radii[i], radii[i], 0.4, 16);
      const mat = new THREE.MeshStandardMaterial({
        color: colors[i],
        metalness: 0.3,
        roughness: 0.4,
        emissive: colors[i],
        emissiveIntensity: 0.15,
      });
      const m = new THREE.Mesh(geo, mat);
      m.position.y = heights[i] + 0.2;
      m.castShadow = true;
      m.receiveShadow = true;
      group.add(m);
    }

  } else if (modelKey === 'cargo') {
    // Yellow ball
    const geo = new THREE.SphereGeometry(0.35, 16, 16);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffc23a,
      metalness: 0.0,
      roughness: 0.55,
      emissive: 0xffc23a,
      emissiveIntensity: 0.05,
    });
    const m = new THREE.Mesh(geo, mat);
    m.position.y = 0.35;
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);

  } else if (modelKey.startsWith('bot_')) {
    // Drivetrain-coded box with a turret cone
    const drivetrainColors = {
      bot_tank:      0x6b4423,
      bot_westcoast: 0x4a5560,
      bot_mecanum:   0x7a5c8c,
      bot_swerve:    0x2e8b6f,
    };
    const baseColor = drivetrainColors[modelKey] || 0x888888;
    const alliance = opts.alliance || 'red';
    const allianceColor = alliance === 'red' ? 0xc72a35 : 0x1e88e5;

    // Hex baseplate-like cylinder
    const baseGeo = new THREE.CylinderGeometry(0.85, 0.85, 0.3, 6);
    const baseMat = new THREE.MeshStandardMaterial({ color: allianceColor, metalness: 0.2, roughness: 0.5 });
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.y = 0.15;
    base.rotation.y = Math.PI / 6; // pointy-top hex orientation
    base.castShadow = true;
    base.receiveShadow = true;
    group.add(base);

    // Body
    const bodyGeo = new THREE.BoxGeometry(1.2, 0.7, 1.2);
    const bodyMat = new THREE.MeshStandardMaterial({ color: baseColor, metalness: 0.3, roughness: 0.5 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.65;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    // Turret arrow pointing +X
    const turretGeo = new THREE.ConeGeometry(0.15, 0.5, 8);
    const turretMat = new THREE.MeshStandardMaterial({ color: 0xffb627, metalness: 0.6, roughness: 0.3 });
    const turret = new THREE.Mesh(turretGeo, turretMat);
    turret.position.set(0.7, 1.05, 0);
    turret.rotation.z = -Math.PI / 2; // point along +X
    turret.castShadow = true;
    group.add(turret);

  } else {
    // Generic unknown
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshStandardMaterial({ color: 0xff00ff });
    group.add(new THREE.Mesh(geo, mat));
  }

  return group;
}
