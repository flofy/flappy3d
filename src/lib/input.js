/**
 * input.js — entrées de secours (clavier, joystick tactile, glissement pour
 * orienter la caméra). Toujours actif : l'app reste jouable même quand les
 * capteurs sont refusés ou bloqués par le navigateur.
 */

export function createKeyboard(doc = document) {
  const keys = new Set();
  const down = (e) => {
    keys.add(e.code);
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
      e.preventDefault();
    }
  };
  const up = (e) => keys.delete(e.code);
  const blur = () => keys.clear();

  doc.addEventListener('keydown', down, { passive: false });
  doc.addEventListener('keyup', up);
  window.addEventListener('blur', blur);

  return {
    read() {
      const x =
        (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) -
        (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
      const y =
        (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) -
        (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
      return { x, y, sprint: keys.has('ShiftLeft') || keys.has('ShiftRight') };
    },
    consumeJump() {
      if (keys.has('Space')) {
        keys.delete('Space');
        return true;
      }
      return false;
    },
    dispose() {
      doc.removeEventListener('keydown', down);
      doc.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    },
  };
}

/** Glissement sur le canvas : oriente la caméra (et désactive le suivi capteur). */
export function createLookControl(element) {
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let moved = false;

  const onDown = (e) => {
    dragging = true;
    moved = false;
    lastX = e.clientX;
    lastY = e.clientY;
    element.setPointerCapture?.(e.pointerId);
  };
  const onMove = (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    if (Math.abs(dx) + Math.abs(dy) > 2) {
      moved = true;
      handlers.move(dx * 0.0055, dy * 0.0045);
    }
  };
  const onUp = (e) => {
    if (dragging && !moved) handlers.tap();
    dragging = false;
    element.releasePointerCapture?.(e.pointerId);
  };

  const handlers = { move: () => {}, tap: () => {} };

  element.addEventListener('pointerdown', onDown);
  element.addEventListener('pointermove', onMove);
  element.addEventListener('pointerup', onUp);
  element.addEventListener('pointercancel', onUp);

  return {
    onMove(fn) {
      handlers.move = fn;
    },
    onTap(fn) {
      handlers.tap = fn;
    },
    dispose() {
      element.removeEventListener('pointerdown', onDown);
      element.removeEventListener('pointermove', onMove);
      element.removeEventListener('pointerup', onUp);
      element.removeEventListener('pointercancel', onUp);
    },
  };
}

/**
 * Joystick tactile (fallback). Renvoie un vecteur x/y dans [-1, 1] relatif à la
 * caméra, compatible avec la sortie des capteurs.
 */
export function createJoystick(element) {
  let active = false;
  let value = { x: 0, y: 0 };
  let pointerId = null;
  const radius = 46;

  const read = (e) => {
    const rect = element.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = (e.clientX - cx) / radius;
    let dy = (e.clientY - cy) / radius;
    const len = Math.hypot(dx, dy);
    if (len > 1) {
      dx /= len;
      dy /= len;
    }
    value = { x: dx, y: -dy };
  };

  const onDown = (e) => {
    active = true;
    pointerId = e.pointerId;
    element.setPointerCapture?.(e.pointerId);
    read(e);
  };
  const onMove = (e) => {
    if (!active) return;
    read(e);
  };
  const onUp = () => {
    active = false;
    pointerId = null;
    value = { x: 0, y: 0 };
  };

  element.addEventListener('pointerdown', onDown);
  element.addEventListener('pointermove', onMove);
  element.addEventListener('pointerup', onUp);
  element.addEventListener('pointercancel', onUp);
  element.addEventListener('lostpointercapture', onUp);

  return {
    read: () => (active ? value : { x: 0, y: 0 }),
    get active() {
      return active;
    },
    get pointerId() {
      return pointerId;
    },
    dispose() {
      element.removeEventListener('pointerdown', onDown);
      element.removeEventListener('pointermove', onMove);
      element.removeEventListener('pointerup', onUp);
      element.removeEventListener('pointercancel', onUp);
      element.removeEventListener('lostpointercapture', onUp);
    },
  };
}
