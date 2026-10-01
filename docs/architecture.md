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
another advance). Taps made while a bead is moving are queued, never dropped, so every
tap is exactly one bead (see Stage 4).

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

## Stage 2: amber that looks like amber

The spec's first lesson: real see-through amber (`transmission`) refracts the dark room
behind it and turns muddy. So amber is a **solid, polished resin with a faked inner
glow**, added in a small shader edit (`amberGlow()` in `strand.js`) on top of three's
`MeshPhysicalMaterial` (clearcoat 1, clearcoat roughness 0.1, roughness 0.2).

What the shader adds, and why:
- **Core glow.** Light is added where the surface faces the viewer, using the spec's
  formula `colour × (0.06 + 0.6 · (N·V)^2.2)`. The centre glows and the rim falls away.
- **Translucency.** The surface itself takes only 45% of the light an opaque bead would,
  but the glow keeps the full colour, so the brightness sits inside the bead.
- **Hue with depth.** The core is pushed toward gold (more green, less blue, which stays
  saturated under tone mapping), and the rim deepens toward red. That matches light that
  has travelled a short or a long way through the resin.
- **Exit glow.** Light from the lamp above focuses through a clear bead and leaves near
  its lower side. The bright crescent low in each bead is the cue that makes glass and
  amber read as translucent.
- **Inclusions.** Small dark flecks of plant debris show only against the glow, strongest
  at the centre, never on the skin, because they are inside.
- **Butterscotch.** 12% of beads, picked by a seeded random choice, are opaque milky
  amber. An `aCloud` value per bead turns them opaque: full surface colour, cloudy
  swirls, little glow, a softer finish.
- **The lamp.** The glow follows the lamp's cone (`vLampGate`), so a bead in the dark
  doesn't glow. Olive and ebony stay solid wood; the glow is switched off for them.

**Checked against photographs.** Three Wikimedia Commons photos served as references
(CC BY-SA 4.0):
- "020240302 Amber muslim prayer beads" by Silar;
- "Hilya-i Sherif and Prayer Bead Museum Beads made of Amber proper in 2018 0335" by
  Dosseman;
- "Baltic amber beads" by Raulfj.

The amber pixels were measured in OKLCH and compared with the render. The first version
was about 15° too orange (median hue 66° against 81–84°), with cores less golden (82°
against 93–99°). The core shift brought the render to about 72° median and 85° in the
cores. The rest of the gap is deliberate: the spec's cognac-to-honey range includes
orange cognac beads, and these references are honey and lemon amber.

**Knock-on checks.** More golden amber widened the beads' hue band, so the palette rules
flagged pomegranate (now too close in hue) and turquoise (too close to olive's lightness
in Count). Both were adjusted, and every check passes again.

Mistakes on the way, kept here because they teach something:
- The first capture of the bead colour came before three applies the per-bead colour
  (`color_fragment`), so the glow was white. The order of shader chunks matters.
- Painting inclusions on the surface made the beads look like speckled eggs.
- Lightening the core washed the colour out, because tone mapping desaturates bright
  colours. Shifting the hue instead kept it saturated.

## Stage 3: the opening and typography

**The title screen** (`intro` in `ui.js`, the boot sequence in `main.js`).
"Misbaḥa" in Amiri italic, one line, a thin loading bar, then a single prompt. The
prompt is the counting gesture itself, so it doubles as the first lesson: "Press Space to
begin" on a keyboard, "Tap anywhere to begin" on a touch-only phone (detected with the CSS
query `(hover: none) and (pointer: coarse)`). Every visit starts with sound; the Sound
button turns it off for that visit. The bar reports real work, not a timer. Boot runs in steps and yields
a frame between them so the bar can move:
1. textures;
2. the room and the strand;
3. settling the physics;
4. compiling every shader ahead of time (`renderer.compileAsync`), so the first lit frame
   doesn't stall;
5. fonts.

The Begin press or tap is also the user gesture browsers require before they allow audio.
The Space that begins must not also pass a bead, so the title screen listens on `window`
in the capture phase (the first stop on an event's way down) and stops the event there,
before it can reach the counting handler. Tested: after Begin the count reads 0, and the
next Space or tap counts 1.

**Begin.**
- The title lifts away (a CSS transform).
- The lamp fades up from darkness over 2.2 s. `setLightLevel()` in `scene.js` scales
  everything that belongs to the lamp together: the spotlight, the wall glow, the
  reflections, the amber's inner glow (`uLampLevel`) and the dust.
- The camera glides from a wide shot of the room to the strand in 3 s. It's a scripted
  move (`rig.glide`) with ease-in-out cubic, which starts and ends at zero speed and
  can't overshoot.
- The header and controls fade in as the camera arrives.
- Counting is blocked until Begin.

**Fonts without jumps.**
- Fonts are self-hosted through Fontsource: Amiri for Arabic, transliteration and
  display; Instrument Sans for labels.
- Each face is split by character range, so a visitor downloads only what the page uses.
  The Arabic face is 109 kB; the Latin faces are 10–30 kB each.
- `loadFonts()` asks for the exact faces in use, and text is revealed only once they've
  arrived, with a 3 s timeout so a slow font can't block the page.
- The one layout shift left, the invisible title box narrowing as fonts arrived, was
  found with the browser's `layout-shift` entries and removed with a fixed width.

**Phrases and numbers.**
- Phrase changes fade the old phrase, then reveal the new one word by word from below:
  Arabic, then transliteration, then meaning, 70 ms apart. The Arabic is split only at
  spaces, so letters within a word stay joined.
- The count and its Arabic-Indic numeral roll like an odometer. Each digit is a column
  whose hidden copy of the digit sets width and baseline, while a clipped strip of 0–9
  slides over it.
- Column widths are Amiri's own digit widths: 0.532 em for Western digits, 0.585 em for
  Arabic-Indic, measured with `measureText`.
- Screen readers get plain text ("12 of 33") from a hidden span, not the strips.

**Reduced motion.** No lift, no glide, no roll and no reveal: Begin goes straight to the
lit scene.

**Measured** (production build, fresh cache, headless Chrome on this Mac's GPU):

| Connection | Title shows | Begin ready | First bead counted |
| --- | --- | --- | --- |
| Broadband, 20 Mbps / 20 ms | 0.60 s | 0.68 s | 1.1 s |
| Good 4G, 9 Mbps / 85 ms | 0.74 s | 0.82 s | 1.0 s |
| Slow 4G, 1.6 Mbps / 150 ms, CPU ÷4, phone size | 3.07 s | 3.20 s | 3.4 s |

The spec's target is under 8 s. The whole page is 336 kB compressed. Layout shift is 0.

## Stage 4: counting feedback

**Fast counting, the acceptance test.** It was measured first, through real key presses:
99 taps 50 ms apart counted only 50, because a queue of 6 dropped the rest. Now taps
queue without limit, and the more are waiting, the faster each bead passes
(`0.1 − 0.008 × queued` seconds, never under 0.05 s, the fastest the thread constraints
follow cleanly). Measured after the change:
- 99 taps at 50 ms and at 30 ms (33 taps a second): 99 counts, in order.
- 100 taps at 40 ms: exactly the hundredth, and no further.
- Tangling: only the pinned bead's two neighbours ever sit above the peg, the same as at
  rest.

**The tick ring** (`showRing()` in `ui.js`) replaces the three bars. There is one mark per
body on the strand, in strand order, clockwise from the top: a long mark for the imām,
dots for the two separators, ticks for beads. Counted beads light amber, and the current
bead is brighter and thicker. The count sits inside the ring. Bead numbers map to strand
positions because the separators come after beads 33 and 66.

**The peg's glow.** A small warm point light sits at the top of the peg.
- Each pass adds a pulse: strength 1 normally, 2.6 at beads 33 and 66 (with a gentle
  two-note bell, `bell()` in `audio.js`), and 3 at the hundredth.
- Pulses raise a target that decays (0.3 s), and the light follows the target smoothly
  (0.06 s). So fast tapping gives a steady glow, not a strobe, which keeps to the spec's
  rule against flicker.
- The strength was set by measuring the peg area's brightness at several intensities:
  about +20% for a pass and +40% at 33 and 66.

**The hundredth.** When the imām returns after bead 99:
- the fuller chime plays, any taps still waiting are cleared, and counting pauses;
- a full-screen moment shows the full tahlīl, the formula for completing the hundred
  reported in Ṣaḥīḥ Muslim, set one phrase per line (*lā ilāha illa-llāhu waḥdahu lā
  sharīka lah* / *lahu-l-mulku wa lahu-l-ḥamdu* / *wa huwa ʿalā kulli shayʾin qadīr*),
  with transliteration and meaning;
- the header and controls step back while it shows;
- the prompt ("Press Space / Tap to begin the next round") and the gesture that dismisses
  it wait until the words have appeared, so fast tapping can't skip past the moment;
- dismissing starts the next round at 0 without passing a bead.

## Stage 5: a hand instead of the peg

**Physics stays simple.** The finger is a capsule collider (`physics.js`): a cylinder with a
rounded tip, 0.9 units long, radius 0.075. A bead is pushed out from the closest point on
the capsule's axis. The finger slides back 1 unit for Hold mode (out of the loop, clear of
the wall) and returns for Count, sliding back into the lifted loop. The rest of the hand
is visual only.

**The hand** (`hand.js`) is a stylised, low-poly right hand built from seven-sided
cylinders and faceted joints, flat-shaded:
- the index finger extended toward the viewer, carrying the strand;
- the other three fingers curled into a fist, kept behind the strand;
- the back of the hand toward the camera;
- the thumb resting on top of the index finger behind the current bead.

It's grey plaster, like a sculptor's cast, so it implies no particular skin tone.

**The thumb's stroke.** The thumb is two bones solved with two-bone inverse kinematics:
given the base and the target for the tip, the law of cosines places the middle joint,
bent outward (toward the back of the hand) rather than up. While a bead passes over the
finger, the tip rides just behind that bead; afterwards it follows through, a little
forward and lifted, then settles back. Measured at the normal view, the tip moves about
25 px per pass on desktop and 16–17 px on a phone.

**Settling within about half a second.** Measured first: after one tap the strand took
over 5 s to settle (95% of bodies under 0.05 units/s). A real strand settles fast
because of friction, so two kinds were added:
- **drag** in Count mode (11 per second; Hold mode keeps 0.4, so a dropped strand still
  falls naturally);
- **finger friction**: beads touching the finger lose 30% of their motion each substep,
  as on the rug.

Result: 0.61–0.65 s. The last motion is the bottom of the loop finishing its one-bead
shift.

**Re-checked.** 99 taps at 30 ms and 100 at 50 ms counted exactly, with no tangling.
The Hold round trip works, and so does the palette.

**What the colour checks caught:**
- The hand sits right under the lamp, and its upward facets outshone the beads (0.85
  against 0.72). The plaster was made darker and faintly cool, so it renders as a neutral
  grey that doesn't drift toward amber.
- Excluding the hand from the bead measurement also exposed an old error: the peg had
  been counted as part of the strand, so the Count-mode bead colours were measured too
  dark (amber 0.38 instead of 0.64). Cobalt and turquoise had been deepened partly
  because of that wrong number; with the corrected one they return closer to their
  natural glaze values.

## Stage 6: sound

*(After Stage 7 the click went back to the original page's, and the ambience became the
ney; see "Sound, revised" below.)*

**No recordings, so modal synthesis.** The spec asks for recorded clicks; none were
available, and fetching sound files from the web needs the owner's permission. Instead
each click is synthesised the way physical-modelling synthesisers do it (`audio.js`):
- an impact excites a few resonant modes of the bead, each a sine that rings and decays
  at its own rate, plus a fraction of a millisecond of contact noise;
- the attack lasts as long as the contact, so harder materials are sharper;
- each material has its own modes: amber a hard bright tick (about 3.2 kHz), olive a
  duller knock (1.5 kHz), ebony a dense clack (2.3 kHz), and brass separators that ring
  longer.

Eight variants per material are rendered once into a bank, so playback costs nothing.
Real recordings could replace a bank later.

**Against machine-gun repetition:**
- never the same variant twice in a row;
- a fixed pitch per bead, from its size (smaller is higher), plus a ±2% random spread;
- varied loudness and up to 4 ms of timing play;
- some variants carry a second, softer tick: the bead knocking its neighbour;
- hurried counting plays lighter (beyond about 8 clicks in half a second);
- each pass is a pull click and a softer landing tick, but the landing tick is skipped
  while taps are waiting, so a fast run doesn't double up;
- a short synthetic room reverb puts the clicks in a space, and a gentle compressor keeps
  overlapping clicks from clipping.

**Landings on the rug.** The physics records any body that reaches the floor faster than
1.5 units/s (`impacts` in `physics.js`, plain data; it knows nothing about sound).
`main.js` plays the strongest two every 40 ms through a low-pass filter (wool muffles
them), louder the faster they land. A dropped strand gives about 19 soft clicks instead
of hundreds.

**Ambience.** A quiet room tone (low brown noise, looped seamlessly), off by default, on
the Ambience button. Sound and Ambience are one-word toggles, filled while on.

**How it was checked.** Each scenario was rendered offline through the same engine, with
`OfflineAudioContext`. Consecutive clicks were compared by normalised cross-correlation
(identical copies would score 1.0): median 0.22–0.49, never above 0.73. Nothing clips.
In the live site, counting, fast counting, a Hold drop and the Ambience toggle were
driven through real input and the clicks counted: 10 unhurried taps play 20 clicks
(pull and landing); 20 fast taps play 21. The final judgement is by ear, so the renders
were kept as a listening file.

## Stage 7: dhikr sets and memory

**The sets** (`dhikr.js`, pure data and arithmetic):
- the tasbīḥ after prayer, as 33·33·33 then the tahlīl, and as 33·33·34;
- istighfār ×100 and ṣalawāt ×100;
- a plain Counter to 100;
- a custom set: any phrase in any script (Arabic script takes the Arabic line), an
  optional meaning, and a target of 1–9999.

Each set is a list of blocks (how many, which phrase) plus the closing words its
completion shows: the full tahlīl, the thirty-fourth takbīr, the fuller istighfār
(*astaghfiru-llāha wa atūbu ilayh*) or the fuller ṣalawāt. `view()` turns a count into
what to show: the phrase, the number within its block, the totals, and whether it ends a
block (the bell) or completes the set (the moment).

**Counting became a count.** Before, the count was read off the strand's position, which
only works for one fixed form. Now every bead or imām passed adds one to the current
set's count. The strand is placed to match the count (Reset, choosing a set, restoring),
so the imām comes round on each hundredth. The ring shows where the count stands on the
strand, so for a custom target like 1000 it goes round ten times.

**Memory.** `localStorage` holds the current set, each set's count and round, and the
custom definition. It's saved on every bead, read inside try/catch, and validated field
by field, so corrupted or old data falls back to defaults instead of crashing (tested).
A new custom phrase starts from zero.

**The panel.** The header's set name opens a dialog with the set list (each with its
saved progress), the custom form and the About page. It's a modal: focus stays inside it
and Escape closes it. Counting keys ignore form fields, so typing a space in the phrase
never passes a bead (tested).

**Bugs the tests caught:**
- *Lost taps after switching sets.* Closing the panel returned focus to the set button,
  so the next Space reopened the panel instead of passing a bead: 5 taps counted 0.
  Focus now returns to the beads; only Escape goes back to the set button.
- *The panel ran off-screen.* Its `max-height: 100%` had nothing definite to resolve
  against inside a content-sized grid, so it was ignored. It's now sized in viewport
  units (`dvh`), and the scrolling body has `min-height: 0`, which lets a flex child
  shrink and scroll.

## Sound, revised: the original click and the ney (after Stage 7)

**What was tried.** The Stage 6 clicks (modal synthesis) sounded electronic. Real
recordings of beads from Freesound came next: single clicks found automatically in
the recordings (onset detection), cut, levelled and played at random. They didn't sound
right either. The owner chose the click from the original single-file page, for all
three materials.

**The click now.** Exactly the original: 50 ms of white noise that dies away in about
3.5 ms, through a band-pass filter at 2.7 kHz (the original amber setting) with Q 5, the
centre moved ±10% each time. The noise is fresh on every click, so no two are the same.
The separators, the landing tick (0.45, 50 ms after) and landings on the rug use it too.
The bowl bells at 33 and 100 stay.

**The ambience: the ney.** The ney is the end-blown reed flute at the heart of Sufi
music. Four Freesound recordings are in `src/ney/` (credits in `src/ney/SOURCES.md` and
in About). `scripts/find-phrases.mjs` finds the phrases in each:
- the loudness is measured every 50 ms;
- a phrase starts where it jumps at least 15 dB from near-silence (a pause, a breath, or
  the end of the last note's reverb tail), so dips inside a phrase don't split it;
- each phrase gets a gain that brings it to the same loudness as the others.

It found 13 phrases, about 70 seconds of playing. The page plays one at a time, in random
order (none of the last four again), with 3–9 seconds of quiet between, panned a little
left or right, in a long dark synthetic hall (about 3 s), over a very faint room tone. So
it never loops audibly. The ney sits about 9 dB under where it started: measured second
by second, phrases come to about −33 dB against the clicks' sharp peaks.

**Loading.** The four MP3s (1.8 MB) are fetched and decoded only when the ambience is
first turned on. In the single-file build they are inlined, which makes that file 3.8 MB.

**Scheduling.** Phrases are booked on the audio clock up to 30 seconds ahead and topped
up every 5 seconds, so timing never depends on the frame loop. Offline, the whole span
is booked at once, which is how the test renders it.

**How it was checked.** Offline renders of every sound, with a minute of ambience under
slow counting; per-second loudness of the ambience against the clicks; in the live site,
the counts of clicks, landings and ney phrases through real input; the production and
single-file builds play both, with no console errors.

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
- *Why fake subsurface scattering instead of real transmission?* Transmission shows the
  scene behind the object; in a dark room that's black, so amber goes muddy. A view-based
  glow reads as translucent resin and costs almost nothing.
- *How do you extend a built-in three.js material?* `onBeforeCompile` splices code into
  named shader chunks. Chunk order matters: per-instance colour is applied in
  `color_fragment`, after the texture in `map_fragment`.
- *How do you judge "looks like the real thing"?* Measure the colour of reference
  photographs and compare distributions (median and spread of hue, chroma and
  lightness), then check by eye.
- *How do you avoid a flash of unstyled text?* Self-host the fonts, request the exact faces
  with `document.fonts.load`, reveal text only when they've arrived (with a timeout), and
  make sure hidden-but-laid-out text can't shift layout when the font swaps.
- *Why a real loading bar?* It reports the actual steps: textures, physics, shader
  compilation. Compiling shaders before the first lit frame removes a visible stutter.
- *How do you measure "loads in under 8 seconds"?* Throttle the network and CPU with the
  Chrome DevTools Protocol on a production build with an empty cache, and time
  navigation → ready → first bead.
- *How do you make "never drop an input" safe?* Queue every input, then let the system's
  pace adapt to the backlog within limits that are measured to be stable, and test the
  worst case (here 33 taps a second) through the real input path.
- *How do you give feedback on rapid events without flicker?* Drive a smoothed level from
  decaying impulses instead of flashing on each event.
- *What is two-bone IK?* Given a base, a target and two bone lengths, the law of cosines
  gives where the middle joint must be; a "pole" direction picks which way it bends.
- *How do you make a simulation settle quickly without looking sluggish?* Add the
  damping a real object has (friction where it touches the finger, light drag), measure
  the settling time, and keep the setting where the motion still looks natural.
- *How do you find a measurement bug?* Here, excluding a new object from the bead mask
  changed the bead colours sharply, which revealed that an older object (the peg) had
  been counted as beads all along.
- *How do you play background music without an audible loop?* Cut recordings into
  phrases, play them in random order with random pauses, and schedule them on the audio
  clock ahead of time rather than from the frame loop.
- *How do you find events in a recording automatically?* Onset detection: follow the
  short-term envelope and mark where it rises sharply above what came just before; then
  measure each event (isolation, overlap, brightness) and keep the clean ones.
- *What is modal synthesis?* Model a struck object as a few resonant modes, damped sines
  with their own frequency, decay and loudness, excited by a short contact. Changing the
  modes changes the material.
- *How do you avoid repetitive UI sounds?* Round-robin variants, per-object pitch, small
  random spreads, density-aware loudness, and merging events that happen too close
  together.
- *How do you test audio you can't hear?* Render it offline with `OfflineAudioContext`,
  measure it (peaks, similarity between events), count what the live code triggers, and
  keep renders for a person to listen to.
- *Why separate content from display?* `dhikr.js` holds the sets as data and computes what
  to show; the UI only draws it. Adding a set means adding data, not code paths.
- *How do you make localStorage robust?* Wrap reads and writes in try/catch, validate
  every field, and fall back to defaults; test with corrupted data.
- *Why do percentage heights sometimes do nothing?* A percentage needs a definite
  containing size; in a content-sized grid or flex context there isn't one. Viewport units
  and `min-height: 0` on flex children are the usual fixes.
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
