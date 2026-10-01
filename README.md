# Misbaḥa

A 3D strand of 99 prayer beads you can count with, built with Three.js and a small
hand-written physics simulation. The build plan lives in [reference/spec.md](reference/spec.md);
the single-file version this project started from is [reference/baseline.html](reference/baseline.html).

## Run it

```bash
npm install
npm run dev            # http://localhost:5173 (the Claude launch config uses port 5186)
npm run build          # dist/ — normal multi-file site
npm run preview        # serve dist/ (the Claude launch config uses port 5188)
npm run build:single   # dist-single/index.html — one self-contained file

npm run check:palette     # the palette's colour rules, on the daylight material colours
npm run calibrate:colour  # white balance: the lamp's colour temperature (needs the dev server)
npm run verify:colour     # the same rules, measured on screen under the lamp (needs the dev server)
```

## Files

| File | Job |
| --- | --- |
| `src/physics.js` | Owns every simulation array; `step()` advances the strand one fixed tick |
| `src/strand.js` | Builds the bead, thread and tassel meshes; reads positions only |
| `src/hand.js` | The low-poly hand: the index finger the strand hangs on, the thumb's IK stroke |
| `src/scene.js` | Renderer, the lamp, the wall and its glow, reflections, rug, camera rig |
| `src/dust.js` | Dust motes drifting in the lamp's beam (switch: `DUST`) |
| `src/textures.js` | Procedural canvas textures: grain, amber clouds, fringe, the rug's field, border and corners, the wall tiles |
| `src/palette.js` | Every room colour (natural dyes and glazes, in OKLCH), the colour rules, the lamp's temperature |
| `scripts/` | The colour scripts: `check-palette`, `calibrate-colour`, `verify-colour` |
| `src/dhikr.js` | The dhikr sets (phrases, blocks, closing words), what to show at each count, saved progress |
| `src/ui.js` | All DOM work: title, phrase, tally ring, controls, set picker and About, the completion moment |
| `src/audio.js` | Modal-synthesis bead clicks per material, rug landings, bell, chime, ambience |
| `src/input.js` | Pointer and keyboard handling |
| `src/main.js` | Boot, the counting / mode controller, the frame loop |

How it all fits together: [docs/architecture.md](docs/architecture.md).

## Progress

- [x] Stage 0: Vite project, ES modules, single-file build
- [x] Stage 1: Art direction and lighting
- [x] Stage 2: Amber that looks like amber
- [x] Stage 3: Opening and typography
- [x] Stage 4: Counting feedback
- [x] Stage 5: A hand instead of the peg
- [x] Stage 6: Sound
- [x] Stage 7: Dhikr sets and memory (waiting for your check in a real browser)
- [ ] Stage 8–9: see the spec
