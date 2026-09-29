# How Misbaḥa works

A plain-language walk through the code, for review and for explaining it to someone else.

## The big picture

Every frame of the page does three things, in this order:

1. **Simulate**: move the beads a little, according to gravity, the thread and collisions (`physics.js`).
2. **Pose**: copy each bead's simulated position into its 3D mesh (`strand.js`).
3. **Draw**: Three.js renders the scene from the camera (`scene.js`).

The simulation doesn't know it's being drawn, and the drawing code never changes the
simulation. That one-way flow (**physics owns the arrays, rendering only reads them**) is
the main architectural rule. It means a visual change (new materials, a hand instead of
the peg) can't break the physics, and the physics can be tested without a screen.

```
 input.js ──► main.js (controller) ──► physics.js ──► strand.js ──► Three.js render
 ui.js    ◄──┘   counting & modes        arrays X       meshes
 audio.js ◄──┘
```

## The physics: position-based dynamics

The strand is 107 small bodies: the imām bead, 99 beads, 2 separators and a 5-body
tassel cord. Each body is just a point with a radius. Their positions sit in one flat
`Float32Array` called `X` (x, y, z, x, y, z, …), which is fast and easy to share.

Each tick, `step()`:

1. **Predicts**: moves every body by its velocity, plus gravity.
2. **Corrects**: nudges bodies back until the rules hold:
   - *thread*: neighbours stay a fixed distance apart (a "distance constraint");
   - *collisions*: any two beads that overlap get pushed apart;
   - *peg*: beads can't be inside the peg's cylinder;
   - *floor*: beads can't go below the rug, and friction slows them there.
3. **Derives velocity** from how far each body actually moved.

This is **position-based dynamics (PBD)**, the same family of methods games use for cloth
and rope. It's popular because it's stable: instead of computing forces (which can blow up
when a step is too big), it moves positions directly to satisfy the constraints.

Two details keep it smooth:

- **Fixed timestep**: physics always advances in exact 1/60 s ticks, however fast the
  screen refreshes. `main.js` keeps an "accumulator" of real elapsed time and runs as
  many ticks as fit (at most 4 per frame, so a slow device doesn't spiral).
- **Substeps**: each tick is split into 12 smaller steps. Many small corrections beat
  one big one for stiff things like thread.

**Inverse mass** (`W`) is how the simulation "holds" a body: a body with inverse mass 0
is infinitely heavy, so constraints move everything else around it. Pinning the bead on
the peg, or grabbing a bead with the pointer, sets its inverse mass to 0. The helpers
`passPin`, `holdPin`, `dropPin`, `grabBody` and `releaseGrab` are the only code allowed
to change it, so a bead can't be left stuck by accident.

## Counting

In Count mode the current bead is pinned on top of the peg. On a tap, `startAdvance()`
releases it, pins the *next* bead, and animates that bead's pin target along an arc up
onto the peg. The rest of the loop follows through the thread constraints, so the whole
strand slides by one bead. Separators pass on their own (`arrive()` immediately starts
another advance). Taps made while a bead is moving are queued (up to 6), so fast
counting never drops or doubles a count.

## Rendering

- **Instancing**: the 97 round beads are one `InstancedMesh`, which is one draw call with
  a different transform and colour per bead. Drawing them as 97 separate meshes would be
  far slower.
- **Procedural textures**: wood grain, amber clouds and the rug are painted on canvases
  in code, so there are no image files to load.
- **Seeded randomness**: bead sizes, tones and texture details come from a seeded random
  generator (mulberry32), so the strand looks identical on every load.
- **Environment map**: a few glowing panels are rendered into a blurred cube map
  (`PMREMGenerator`), which gives the beads soft studio reflections.

## Stage 0 decisions and trade-offs

- **Vite + ES modules** replace one 800-line HTML file. Vite gives instant reloads in
  development and a small optimised bundle for production. `vite-plugin-singlefile`
  still produces one self-contained HTML file for sharing.
- **Three.js r128 → r169.** Two things changed underneath and had to be compensated
  for so the look stayed the same:
  - *Colour management*: r152+ treats hex colours as sRGB and converts them to linear
    automatically, so every `convertSRGBToLinear()` was removed. The baseline passed a few
    colours as bare hex numbers, which r128 read as *linear*; `legacyHex()` in `scene.js`
    keeps that reading until Stage 1 relights the room.
  - *Physical light units*: r155+ dropped a hidden ×π on lights, so the light
    intensities are multiplied by π.
- **One random stream, sliced.** The baseline drew all its randomness from a single
  generator, in a fixed order. Mulberry32 can jump ahead instantly, so each module takes
  its own slice of the same stream (`RNG_SKIP` in `physics.js`). The result is
  bit-for-bit the same beads, without modules depending on load order.
- **Page head.** The baseline had no `<!doctype>`, charset or viewport tag (its host
  added them). Without the charset, the Arabic text garbles; without the viewport tag,
  phones render a zoomed-out desktop page.

### Known differences from the baseline

Measured by averaging canvas pixels over the same regions in both versions: the
whole frame, beads, rug and background match within 1–2 levels out of 255. The one
outlier is the **peg body, about 10% darker**, while its front cap matches exactly.
The body's grain texture is squeezed hard along the peg's length, so the likely cause
is that r152+ stores and filters sRGB textures differently from r128. Stage 1 relights
the room and Stage 5 replaces the peg with a hand, so it wasn't chased further.

Carried over unchanged, for later stages: the Arabic vowel marks touch the eyebrow
line above them (Stage 3), and on phones the rail buttons are 34 px tall (Stage 8
wants 44 px) and "Sound on" wraps onto two lines.

## Interview questions this answers

- *Why position-based dynamics over a force-based spring model?* It stays stable under
  stiff constraints and big timesteps, and it's simple to pin or drag a body.
- *Why a fixed timestep?* The same input gives the same motion on a 60 Hz laptop and a
  120 Hz phone, and the physics can't explode on a slow frame.
- *What is instancing?* One draw call for many copies of a mesh, each with its own
  transform. The GPU does the repetition.
- *What does colour management mean in Three.js?* Colours are authored in sRGB, lit in
  linear space (where light adds up correctly), then converted back for the screen.
