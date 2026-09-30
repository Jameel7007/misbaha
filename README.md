# Misbaḥa

A 3D strand of 99 prayer beads you can count with, built with Three.js and a small
hand-written physics simulation. The build plan lives in [reference/spec.md](reference/spec.md);
the single-file version this project started from is [reference/baseline.html](reference/baseline.html).

## Run it

```bash
npm install
npm run dev            # http://localhost:5173 (the Claude launch config uses port 5186)
npm run build          # dist/ — normal multi-file site
npm run build:single   # dist-single/index.html — one self-contained file

npm run check:palette     # the palette's colour rules, on the daylight material colours
npm run calibrate:colour  # white balance: the lamp's colour temperature (needs the dev server)
npm run verify:colour     # the same rules, measured on screen under the lamp (needs the dev server)
```

## Files

| File | Job |
| --- | --- |
| `src/physics.js` | Owns every simulation array; `step()` advances the strand one fixed tick |
| `src/strand.js` | Builds the bead, thread, tassel and peg meshes; reads positions only |
| `src/scene.js` | Renderer, the lamp, the wall and its glow, reflections, rug, camera rig |
| `src/dust.js` | Dust motes drifting in the lamp's beam (switch: `DUST`) |
| `src/textures.js` | Procedural canvas textures: grain, amber clouds, fringe, the rug's field, border and corners, the wall tiles |
| `src/palette.js` | Every room colour (natural dyes and glazes, in OKLCH), the colour rules, the lamp's temperature |
| `scripts/` | The colour scripts: `check-palette`, `calibrate-colour`, `verify-colour` |
| `src/ui.js` | All DOM work: phrase, count, controls, fallback |
| `src/audio.js` | Synthesised bead click and completion chime |
| `src/input.js` | Pointer and keyboard handling |
| `src/main.js` | Boot, the counting / mode controller, the frame loop |

How it all fits together: [docs/architecture.md](docs/architecture.md).

## Progress

- [x] Stage 0: Vite project, ES modules, single-file build
- [x] Stage 1: Art direction and lighting
- [x] Stage 2: Amber that looks like amber (waiting for your check in a real browser)
- [ ] Stage 3–9: see the spec
