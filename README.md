# FRC AUTON · 3D

Three.js port of the FRC Auton playtest tool. Deploys to GitHub Pages.

## Quick start

```bash
npm install
npm run dev
```

Then open http://localhost:5173 (Vite will open it automatically).

## Project structure

```
public/models/     ← drop your .glb files here
src/
  config.js        ← model paths, offsets, scales — TWEAK THIS for each model
  sim/             ← simulation: hex math, planning, scoring (no rendering)
  render3d/        ← Three.js scene: field, bots, pieces, camera, effects
  ui/              ← HTML overlays: setup screen, FRC HUD
  styles.css       ← all CSS for HTML overlays
  main.js          ← entry point that wires everything together
```

## Model conventions

Each model in `public/models/` should follow these rules. If your source files
don't match, fix them via the `MODEL_TRANSFORMS` config in `src/config.js`
rather than re-exporting — that config lets you offset, rotate, and scale each
model at load time.

1. **Forward axis: +X.** Bots face +X in their source pose.
2. **Origin at contact point.** Bot origin = center of baseplate at ground level. Cargo origin = center of ball at ground.
3. **Scale: 1 hex width = ~2 world units.** Tweakable per-model in config.
4. **No baked-in lighting.** PBR materials only.
5. **One asset per file.** field, hub, cargo, plus one per drivetrain.

If origins are wrong in the source files, edit `MODEL_TRANSFORMS` to apply
position/rotation/scale offsets at load time. No need to touch Blender.

## Required model files

```
public/models/
  field.glb         ← carpet + perimeter (hex grid is generated procedurally)
  hub.glb           ← scoring tower at field center
  cargo.glb         ← single cargo ball
  bot-tank.glb      ← Tank drivetrain
  bot-westcoast.glb ← West Coast drivetrain
  bot-mecanum.glb   ← Mecanum drivetrain
  bot-swerve.glb    ← Swerve drivetrain
```

If a file is missing, the renderer falls back to a placeholder colored
primitive so you can keep working.

## Deploying to GitHub Pages

1. Push the repo to GitHub (`main` branch).
2. In the repo's **Settings → Pages**, set **Source** to "GitHub Actions".
3. Edit `vite.config.js` so the `REPO_NAME` constant matches your repo name
   (e.g. `/frc-auton-3d/`).
4. Push to main. The workflow at `.github/workflows/deploy.yml` builds and
   deploys automatically.

## Camera controls (in dev)

- **Drag:** orbit
- **Right-drag:** pan
- **Scroll:** zoom
- **Number keys:** snap to preset cameras (1=top-down, 2=broadcast, 3=red-side)
