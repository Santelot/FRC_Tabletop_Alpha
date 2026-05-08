# Model setup guide

## Exporting from TinkerCad

TinkerCad doesn't export `.glb` directly — it exports `.obj`, `.stl`, or `.svg`.
Three.js needs `.glb`. Two paths:

### Option A: Online conversion (no Blender needed) — recommended

1. In TinkerCad, click **Export** → **OBJ** or **STL**.
2. Open https://imagetostl.com/convert/file/obj/to/glb (or any other reputable
   `.obj`/`.stl` → `.glb` converter — there are dozens).
3. Upload the file, download the result, rename it to match what `config.js`
   expects (e.g. `bot-tank.glb`), and drop it in `public/models/`.
4. Refresh the dev server. Your model should appear.

If the model loads but is wrong-sized, wrong-rotated, or wrong-positioned —
that's expected. Fix it via `MODEL_TRANSFORMS` in `src/config.js` (see below).
Don't go back to TinkerCad/Blender for these adjustments.

### Option B: Blender (when you want fine control)

If TinkerCad exports look bad in 3D viewers (broken normals, weird scales),
the safest fix is round-tripping through Blender:

1. Open Blender, `File → Import → Wavefront (.obj)` or STL.
2. Select the imported object.
3. `File → Export → glTF 2.0 (.glb/.gltf)`. Choose `.glb` (Binary).
4. In the export dialog, leave defaults; `+Y Up` (the default in the glTF
   exporter) is what Three.js expects.

Even with Blender, you can still leave origin/scale offsets to
`MODEL_TRANSFORMS` rather than fixing them in Blender — it's faster and
nondestructive.

## Tuning a model's transform

Open `src/config.js` and find the `MODEL_TRANSFORMS` block. Each model has:

```js
bot_tank: {
  position: [0, 0, 0],   // x, y, z offset to apply to the inner mesh
  rotation: [0, 0, 0],   // degrees, applied around x, y, z axes
  scale:    1.0,          // uniform scale; or [sx, sy, sz] for per-axis
},
```

### Common fixes

**Model is huge or tiny:** change `scale`. A bot should be roughly 2 world
units across (1 hex). Cargo should be roughly 0.6–0.8 units in diameter.
The hub should be 4–5 units across at the base.

**Model floats above the ground:** lower it. `position: [0, -0.5, 0]` would
drop it half a unit. Conversely, if it's buried, raise it.

**Model is centered on its own middle (not its bottom):** the pivot point is
inside the model. To put the bottom of the model at ground level, set
`position: [0, +HEIGHT/2, 0]` where HEIGHT is the model's vertical size in
its own units. (Yes, you'll have to eyeball this. Tweak in increments of
0.1 until the bot's wheels sit on the ground.)

**Model faces wrong direction:** the convention is +X (red bots facing right
at the start). If your model faces +Z, set `rotation: [0, -90, 0]`. If it
faces -X, set `rotation: [0, 180, 0]`. Note rotation is in DEGREES.

### Workflow tip

The dev server has hot reload. Save `config.js` and the page updates. Tune
each model's transform in real time:
1. Look at the model in the 3D scene.
2. Tweak one number in `config.js`.
3. Save — see the change immediately.
4. Repeat until it looks right.

## Scale validation checklist

Once your models are loaded and roughly placed, check:

- [ ] All six bots fit inside their hex (don't spill over neighbors)
- [ ] Hub fits within the 7-hex hub cluster (which is roughly 3.5 units wide)
- [ ] Cargo balls are clearly smaller than bots (roughly 1/3 the bot's footprint)
- [ ] Bots stand on the ground (bottoms at y=0, not floating, not sunk)
- [ ] Hub stands on the ground at field center
- [ ] Red bots face toward the blue side; blue bots face the opposite way

If any of these are off, the per-model transform fixes them. No need to
re-export anything.
