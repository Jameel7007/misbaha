// Pointer and keyboard: tap to count, drag beads in Hold mode, drag empty space to orbit.
import { Plane, Raycaster, Vector2, Vector3 } from 'three';
import { X, grabBody, moveGrab, nearestBody, releaseGrab, sim } from './physics.js';

export function attachInput({ canvas, camera, rig, getMode, onPass, onUnlock }) {
  const ray = new Raycaster(), ndc = new Vector2(), plane = new Plane(), hitP = new Vector3(), look = new Vector3(), at = new Vector3();
  function setRay(e) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
  }
  function pick(e) { setRay(e); return nearestBody(ray.ray.origin, ray.ray.direction); }
  function setCursor(c) { canvas.dataset.cursor = c || (getMode() === 'count' ? 'count' : ''); }

  let drag = null;
  canvas.addEventListener('pointerdown', e => {
    onUnlock();
    canvas.focus({ preventScroll: true });
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
    drag = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false };
    if (getMode() === 'hold') {
      const hit = pick(e);
      if (hit >= 0) {
        grabBody(hit);
        // drag in the plane facing the camera through the grabbed bead
        camera.getWorldDirection(look);
        plane.setFromNormalAndCoplanarPoint(look, at.set(X[3 * hit], X[3 * hit + 1], X[3 * hit + 2]));
        setCursor('grabbing');
      }
    }
  });
  canvas.addEventListener('pointermove', e => {
    if (!drag) {
      if (getMode() === 'hold') setCursor(pick(e) >= 0 ? 'grab' : '');
      return;
    }
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    drag.x = e.clientX; drag.y = e.clientY;
    if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 6) drag.moved = true;
    if (sim.grab >= 0) {
      setRay(e);
      if (ray.ray.intersectPlane(plane, hitP)) moveGrab(hitP.x, hitP.y, hitP.z);
    } else if (drag.moved) rig.orbit(dx, dy);
  });
  const endDrag = e => {
    if (!drag) return;
    if (sim.grab >= 0) { releaseGrab(); setCursor(''); }
    else if (!drag.moved && getMode() === 'count' && e.type === 'pointerup') onPass();
    drag = null;
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('wheel', e => { e.preventDefault(); rig.zoom(e.deltaY); }, { passive: false });
  document.addEventListener('keydown', e => {
    const t = e.target;
    if (t && t.tagName === 'BUTTON') return;
    if (e.code === 'Space' || e.key === 'Enter' || e.key === 'ArrowDown') { e.preventDefault(); onUnlock(); onPass(); }
  });

  return { setCursor };
}
