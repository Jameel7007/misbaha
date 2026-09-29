# Misbaḥa: build spec for Claude Code

**Starting point:** `misbaha.html` (the version you chose to keep). Give Claude Code this spec and that file together.
**Ambition:** a site that could stand next to Awwwards Site of the Day winners. It should be calm, tactile and cinematic, with one object done extremely well rather than many effects.
**How to work:** one stage per session. Open it in a real browser (desktop and phone) after every stage. Don't start the next stage until the current one passes its acceptance checks.

---

## 1. What the baseline already does (keep all of it working)

- **Strand model:** 102 loop bodies (index 0 imām, 1–33 beads, 34 separator, 35–67 beads, 68 separator, 69–101 beads) plus a 5-body tassel cord.
- **Physics:** position-based dynamics, fixed 60 Hz step, 12 substeps. Thread = distance constraints between neighbours; every other pair collides as spheres; floor with friction; the peg is a cylinder collider.
- **Count mode:** the current bead is pinned on top of the peg. Each tap / Space / "Next bead" moves the next bead along an arc onto the peg and releases the old one, so the loop slides by one. Separators pass automatically. Arriving at the imām after bead 99 completes the hundred and starts a new round.
- **Hold mode:** the peg retracts, the strand drops onto the rug, any bead can be dragged. Switching back lifts the strand onto the peg again.
- **Looks:** instanced beads (one draw call) with per-bead size, tone and grain rotation; procedural amber and wood textures; brass separators; lathe-turned imām; silk thread and fringed tassel; baked studio reflections; soft shadows; madder-red rug with a khatam lattice.
- **UI:** Arabic phrase + transliteration + meaning; count per 33, Arabic-Indic numeral, three progress bars, round number; Amber / Olive / Ebony; sound; reset.

---

## 2. Lessons from the attempts after this version (read before starting)

These were tried and rejected. Don't repeat them.

1. **Real see-through amber (`transmission`) looks dark and muddy** on a dark background, because it refracts the darkness behind it. Build amber as a solid glossy resin with a *fake inner glow* instead (see Stage 2).
2. **Animated film grain reads as jittery, flickering light.** If you add grain at all, keep it static and very faint, or leave it out.
3. **Bloom on 99 small glossy beads sparkles and flickers.** Keep bloom off, or use a high threshold (~0.95+) and low strength (~0.25), and raise clearcoat roughness a little so highlights are not pinpoints.
4. **Postprocessing turns off antialiasing.** If you use an `EffectComposer`, give it a multisampled render target (`samples: 4`), or bead edges and the thread will crawl as the camera moves.
5. **Constant camera sway adds to the jitter.** Idle motion must be barely perceptible, or triggered only by events.
6. **Colour spaces:** when moving to Three.js r152+, colours and textures are colour-managed automatically. Remove every `convertSRGBToLinear()`, use `colorSpace = SRGBColorSpace` on colour textures, and multiply light intensities by about π (physically based lights).
7. **Headless browsers render this at 1–2 fps**, so screenshots from automated checks are only a rough guide. Judge motion and light by eye on a real device.

---

## 3. Stages

### Stage 0: Project setup
- Move to a small Vite project with Three.js r16x as ES modules. Split into `physics.js` (arrays + `step()`), `strand.js` (meshes, reads positions only), `scene.js` (lights, room, camera), `ui.js`, `audio.js`, `main.js`.
- Keep a build script that outputs a single self-contained HTML file as well.
- **Accept when:** the Vite build looks and behaves exactly like the baseline; no console errors; 60 fps on a mid-range laptop.

### Stage 1: Art direction and lighting
- One warm lamp overhead (`SpotLight`, soft penumbra) in an otherwise dark room; the strand is the brightest thing on screen.
- A faint warm glow on the wall behind the strand so the silhouette reads.
- Rug visible only inside the lamp's pool of light.
- Optional: slow dust motes in the beam, only if they don't flicker (sizes ≥ 1.5 px, no twinkling).
- **Accept when:** a still screenshot looks like a photograph of an object on a dark set; nothing flickers or shimmers when the camera is still or moving slowly.

### Stage 2: Amber that looks like amber
- Solid `MeshPhysicalMaterial`, clearcoat 1, clearcoat roughness ~0.1, roughness ~0.2.
- Inner glow via `onBeforeCompile`: add `diffuseColor.rgb * (0.06 + 0.6 * pow(max(dot(N, V), 0), 2.2))` to emissive, scaled by lamp level. The centre of each bead glows and the rim darkens, like polished resin.
- Per-bead variety from cognac (`#a4500c`) to honey (`#f0a53a`), plus a few cloudy "butterscotch" beads.
- Keep Olive and Ebony solid; add 1–2 more materials later (turquoise, date-seed).
- **Accept when:** side by side with a photo of a Baltic amber misbaha, the colour and glow read as the same material at normal viewing distance.

### Stage 3: Opening and typography
- Title screen: "Misbaḥa" large in Amiri italic, one short line, a thin loading bar, then "Begin with sound" / "Begin in silence" (this also unlocks audio).
- On Begin, the screen lifts away, the lamp fades up, and the camera glides from a wide shot to the strand (about 3 s, easing, no overshoot).
- Phrase changes reveal word by word from below; numbers roll like an odometer.
- Fonts: Amiri for Arabic and transliteration; one refined sans for labels (Instrument Sans or similar); optionally Aref Ruqaa for large background calligraphy.
- **Accept when:** from load to first bead takes under 8 s on a normal connection, and nothing appears unstyled or jumps as fonts load.

### Stage 4: Counting feedback
- Replace the three bars with a 99-tick ring that mirrors the strand: a long mark for the imām, dots for the separators, filled ticks for counted beads, a highlighted tick for the current bead.
- A soft warm glow on the peg each time a bead passes; stronger at 33 and 66, with a gentle chime.
- At 100: a full-screen moment with the full tahlīl (Arabic, transliteration, meaning), then "Tap to begin the next round".
- **Accept when:** you can count a full 99 quickly (tapping fast) without the strand tangling, skipping or double counting.

### Stage 5: A hand instead of the peg
- A stylised, low-poly hand: the strand drapes over the index finger; the thumb makes a small pulling motion on each count.
- Physics stays simple: the finger is a capsule collider; the hand mesh is only visual.
- **Accept when:** each tap visibly shows the thumb passing a bead, and the strand settles within about half a second.

### Stage 6: Sound
- Short recorded bead clicks per material (base64-inlined), with pitch varied slightly per bead.
- Soft clicks when beads land on the rug in Hold mode (speed threshold, throttled).
- Optional quiet room tone, off by default.
- **Accept when:** fast counting sounds natural, not machine-gun repetitive.

### Stage 7: Dhikr sets and memory
- Presets: after-prayer tasbīḥ (33/33/33 + tahlīl, or 33/33/34), plain counter to 100, istighfār ×100, ṣalawāt ×100, custom phrase and target.
- Progress per preset saved in `localStorage` (wrapped in try/catch) and restored on reload.
- An About panel: what a misbaḥa is, the three phrases, how to use the page.

### Stage 8: Performance, phones and accessibility
- Phone layout: nothing covers the peg/hand area; controls in a bottom sheet; tap targets ≥ 44 px.
- Adaptive quality: lower shadow map size and pixel ratio on weak devices; hold 60 fps on a recent phone, never below 30 on an older one.
- `prefers-reduced-motion`: no camera glide or sway, instant bead passes.
- Keyboard: Space / Enter / ↓ to count, Tab reaches every control, visible focus.

### Stage 9: Awwwards polish checklist
- Custom cursor on desktop ("Pass", "Drag").
- Smooth transitions between Count and Hold (camera and peg together, about 1 s).
- Share image (Open Graph), favicon, page title, credits line.
- Test on Chrome, Safari (desktop and iOS) and Firefox.
- Record a 20–30 s screen capture for the submission.

---

## 4. Rules for Claude Code
- Physics owns the arrays; rendering only reads them.
- A pinned or grabbed body must always be released on a mode switch or reset (never leave inverse mass at 0 by accident).
- One change of visual direction per session, checked on a real device before moving on.
- After each stage, report: fps (desktop and phone), console errors, and what you could not test.
