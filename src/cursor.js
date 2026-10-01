// A custom cursor over the beads, for a mouse or trackpad only: a thin ring with a word that
// says what a click will do. "Pass" in Count mode; "Drag" over a bead in Hold mode, filled
// while holding one; "Turn" while dragging the view. Over the controls and text, the
// ordinary cursor comes back. With reduced motion the ring sits exactly on the pointer;
// otherwise it trails it very slightly.
const LABELS = { count: 'Pass', grab: 'Drag', grabbing: 'Drag', turning: 'Turn' };

export function createCursor(canvas) {
  const fine = matchMedia('(hover: hover) and (pointer: fine)');
  const still = matchMedia('(prefers-reduced-motion: reduce)');
  const el = document.createElement('div');
  el.className = 'cursor'; el.setAttribute('aria-hidden', 'true');
  el.innerHTML = '<span class="cursor-ring"></span><span class="cursor-label"></span>';
  document.body.appendChild(el);
  const label = el.lastChild;

  let x = -100, y = -100, cx = x, cy = y, over = false, raf = 0;
  const show = () => el.classList.toggle('on', over && fine.matches && document.body.classList.contains('begun'));
  function tick() {
    const k = still.matches ? 1 : 0.45;   // per frame: close enough to feel attached
    cx += (x - cx) * k; cy += (y - cy) * k;
    el.style.transform = `translate3d(${cx}px, ${cy}px, 0)`;
    raf = Math.abs(x - cx) + Math.abs(y - cy) > 0.1 ? requestAnimationFrame(tick) : 0;
  }
  window.addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse') { over = false; show(); return; }
    x = e.clientX; y = e.clientY;
    // over the canvas, or dragging from it (pointer capture keeps events on the canvas)
    over = e.target === canvas;
    if (!over) { cx = x; cy = y; }   // re-entering: no trail across the screen
    show();
    if (!raf) raf = requestAnimationFrame(tick);
  }, { passive: true });
  document.addEventListener('pointerleave', () => { over = false; show(); });
  window.addEventListener('blur', () => { over = false; show(); });
  window.addEventListener('pointerdown', e => { if (e.target === canvas) el.classList.add('down'); });
  window.addEventListener('pointerup', () => el.classList.remove('down'));
  fine.addEventListener('change', show);

  // the word follows input.js's cursor state (canvas.dataset.cursor)
  const sync = () => {
    const c = canvas.dataset.cursor || '';
    label.textContent = LABELS[c] || '';
    el.dataset.state = c;
  };
  new MutationObserver(sync).observe(canvas, { attributes: true, attributeFilter: ['data-cursor'] });
  sync();
  return { show };
}
