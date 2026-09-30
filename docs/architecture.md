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
another advance). Taps made while a bead is moving are queued (up to 6), so a quick
run of taps is counted exactly. Tapping faster than about one tap per 0.1 s overflows
the queue and the extra taps are dropped, which Stage 4 revisits.

## Rendering

- **Instancing**: the 97 round beads are one `InstancedMesh`, which is one draw call with
  a different transform and colour per bead. Drawing them as 97 separate meshes would be
  far slower.
- **Procedural textures**: wood grain, amber clouds and the rug are painted on canvases
  in code, so there are no image files to load.
- **Seeded randomness**: bead sizes, tones and texture details come from a seeded random
  generator (mulberry32), so the strand looks identical on every load.
- **Environment map**: a dark room with one glowing panel where the lamp is, rendered
  into a blurred cube map (`PMREMGenerator`). It gives the beads reflections that agree
  with the real light.

## Stage 0 decisions and trade-offs

- **Vite + ES modules** replace one 800-line HTML file. Vite gives instant reloads in
  development and a small optimised bundle for production. `vite-plugin-singlefile`
  still produces one self-contained HTML file for sharing.
- **Three.js r128 → r169.** Two things changed underneath and had to be compensated
  for so the look stayed the same:
  - *Colour management*: r152+ treats hex colours as sRGB and converts them to linear
    automatically, so every `convertSRGBToLinear()` was removed. The baseline passed a few
    colours as bare hex numbers, which r128 read as *linear*; a `legacyHex()` helper kept
    that reading for Stage 0, and Stage 1 removed it along with the old lights.
  - *Physical light units*: r155+ dropped a hidden ×π on lights, so Stage 0 multiplied
    the old intensities by π. Stage 1's lights are set directly in physical units.
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
is that r152+ stores and filters sRGB textures differently from r128. Stage 1 relit
the room and Stage 5 replaces the peg with a hand, so it wasn't chased further.

Carried over unchanged, for later stages: on phones the rail buttons are 34 px tall
(Stage 8 wants 44 px) and "Sound on" wraps onto two lines. (The Arabic vowel marks
touching the eyebrow line was fixed during Stage 1; see below.)

## Stage 1: lighting

The brief: one warm lamp overhead in an otherwise dark room, the strand the brightest
thing on screen, a faint glow on the wall behind it, and the rug seen only in the pool
of light. Nothing may flicker.

- **One lamp** (`SpotLight` in `scene.js`). Its intensity is in candela, and light falls
  off with the square of distance (`decay: 2`), as in a real room. Its beam runs down
  the strand. The `penumbra` makes the edge of the cone soft, so on the rug the light is
  full within about 1.25 units of the strand and gone by about 2.5. In Hold mode that
  pool frames the pile of beads, and a bead dragged away leaves the light.
- **Reflected light follows the lamp** (`gateToLamp()` in `scene.js`). The environment
  map lights every surface the same wherever it is, so at first a bead dragged out of the
  pool stayed bright. Outside the cone a bead can't see the lamp, so a small shader
  addition fades the bead's reflected light (diffuse glow and highlights) with the cone,
  down to 10%, so it can still be found. It applies to the beads, thread, tassel and peg,
  which is also why the back of the peg now fades into the dark as it enters the wall.
- **The wall** sits exactly where the peg's back end is, so the peg comes out of it and
  slides back into it in Hold mode. A small warm `PointLight` just in front of it lights
  a soft patch of wall. It's placed along the Count camera's line of sight, so the glow
  sits *behind* the strand on screen. Dark Ebony beads read against it.
- **Reflections agree with the light.** The environment map is now a dark box with one
  warm panel where the lamp is, so each bead's highlight comes from the right direction.
- **A three.js quirk.** With a scene-wide environment map (`scene.environment`), r169
  ignores each material's own `envMapIntensity`. The rug kept glowing with no lights on
  until the rug and wall were given their own reference to the map (`dimEnv()` in
  `scene.js`). Found by switching each light off in turn and measuring pixels.
- **The rug** (`drawField()` in `textures.js`). An interlaced eight-point-star pattern
  built with Hankin's "polygons in contact" method, the classical construction behind
  much Islamic geometric art. Start from the tiling of octagons and squares, send two
  rays from the midpoint of every edge at a fixed *contact angle*, and stop each ray
  where it meets its neighbour. 72° gives sharp eight-point stars ringed by rosette
  petals. Where two bands cross, the one leaving toward the next corner goes over, so
  each band alternates over and under, as in real strapwork. The tile is drawn at
  1024 px for 0.8 world units with full anisotropic filtering, which keeps it crisp even
  at a low viewing angle.
- **Arabic spacing.** Amiri stacks marks high: the shadda with the small alif over the
  *lām* of Allāh rises about 0.56 em above the line box, so it ran into the eyebrow line
  above. It was measured with the font's real metrics (canvas `measureText`) at every
  breakpoint. The fix is a top margin in `em` (0.58 em), so the gap scales with the text,
  plus line-height 1.55 so the two lines of the long *tahlīl* don't crowd each other.

How it was checked: headless Chrome on this Mac's GPU (Playwright) for full-resolution
stills, pixel measurements with each light toggled, frame-to-frame difference counts for
flicker, and real key presses for counting (60 presses 120 ms apart gave exactly 60
counts, in order).

## Colour: a checkable system

The palette lives in `src/palette.js`, and three scripts hold it to written rules.

**Where the colours come from.**
- **The rug** uses the natural dyes of Persian and Anatolian carpets: madder (red),
  indigo (blue), weld (a cool yellow), walnut (dark brown outlines) and pomegranate
  (khaki). The strapwork is natural grey wool.
- **Green, for Paradise,** sits at the heart of every star, made the way dyers made it:
  indigo overdyed with weld.
- **A dark field with a lighter border.** The border ground is a pale indigo bath,
  common in Persian and Caucasian rugs and nearly opposite amber on the colour wheel.
- **The rug is bounded,** with its top toward the wall, as a prayer rug faces the qibla.
- **The wall** is Ilkhanid Kashan star-and-cross tilework: cobalt eight-point stars,
  turquoise crosses, tin-white rosettes.

**How colour is described.** Every colour is written in OKLCH, a perceptual colour space:
L is lightness, C is chroma (how vivid), h is hue angle. Equal numeric steps look roughly
equally different, so "these two colours are distinct" becomes a number, ΔE_OK.

**The rules** (`RULES` in `palette.js`):
1. **Hue:** coloured ground stays 15° away from the beads' own orange-brown hues.
2. **Figure and ground:** every large area (field, border, wall, floor) differs from
   every bead material by ΔE ≥ 0.10.
3. **Neighbours:** colours that touch in a pattern differ by ΔE ≥ 0.08.
4. **Structure:** a dark field (L ≤ 0.42) with a border at least 0.15 lighter.
5. **Under the lamp only:**
   - The beads are the most saturated thing.
   - Large areas sit between ebony's typical tone and amber's lit faces.
   - No hotspot in the room (the brightest 0.1% of pixels) outshines the beads.

Colours have roles. Figure-ground rules apply to *area* colours; thin *lines* and small
*accents* obey hue, chroma and neighbour rules but can't swallow a bead.

**White balance, not repainting.** The first attempt specified what each colour should
look like on screen and solved for the dye that produces it. Under the warm lamp,
"ivory" wool had to be blue and madder purple, which no dyer would do. A photographer
solves this with the camera's white balance instead, so that's what the scene does now:
- The palette holds the **true daylight colours** of the materials.
- The lamp's colour is a **colour temperature in kelvin**.
- `calibrate:colour` finds the temperature at which undyed ivory wool (the "grey card",
  `WHITE_REF`) reads as ivory plus a trace of warmth. The answer is 5000 K.
- Every colour now shifts by less than ΔE 0.08 from its daylight self.

**The three scripts.**
- `npm run check:palette` applies the rules to the daylight colours, against each bead
  material's typical tone. No browser needed.
- `npm run calibrate:colour` finds the lamp temperature. It needs the dev server.
- `npm run verify:colour` renders every palette colour flat on its surface under the real
  lamp, reads back the screen colour, measures the beads the same way (median pixel, plus
  the 75th percentile for their lit faces), and applies every rule, including the hotspot
  check. It needs the dev server.

**Things the checks caught** that eyeballing hadn't:
- Undyed camel and ivory drift into the beads' brown under any warm light. They were
  replaced by grey wool and pale indigo.
- Blues go grey under an orange glow. The glow now uses the lamp's own white.
- A glossy glaze mirrored the glow as a hotspot brighter than the beads. The tiles got a
  satin finish (roughness 0.65).
- The first hotspot rule (99th percentile) didn't catch that hotspot. It covers under 1%
  of the frame. The rule was tested against the glossy glaze and tightened to the 99.9th
  percentile, which does.

## Interview questions this answers

- *Why position-based dynamics over a force-based spring model?* It stays stable under
  stiff constraints and big timesteps, and it's simple to pin or drag a body.
- *Why a fixed timestep?* The same input gives the same motion on a 60 Hz laptop and a
  120 Hz phone, and the physics can't explode on a slow frame.
- *What is instancing?* One draw call for many copies of a mesh, each with its own
  transform. The GPU does the repetition.
- *How do you debug "why is this lit?"* Turn light sources off one at a time and
  measure the pixels, rather than guessing from screenshots.
- *How do you make "good colour" checkable?* Pick a perceptual colour space (OKLab), write
  the design intent as measurable rules (contrast, hue separation, lightness hierarchy),
  and test them both on the material colours and on the rendered image.
- *Why white balance instead of adjusting each colour?* It keeps materials physically true
  and fixes the cause (the light's colour) with one parameter, as a photographer does.
- *How do you know a check works?* Break the thing on purpose and confirm the check fails.
  Here the hotspot rule passed a hotspot until it was tested that way.
- *How are Islamic star patterns constructed?* One classical way is Hankin's method:
  rays from each edge midpoint of a polygon tiling at a contact angle, stopped where
  they meet. Changing the angle changes the whole character of the pattern.
- *What does `onBeforeCompile` do in three.js?* It lets you splice a few lines into a
  built-in material's shader (here, to fade reflected light outside the lamp's cone)
  without writing the whole shader yourself.
- *What is a penumbra?* The soft edge of a spotlight's cone, where light fades from
  full to none.
- *What does colour management mean in Three.js?* Colours are authored in sRGB, lit in
  linear space (where light adds up correctly), then converted back for the screen.
