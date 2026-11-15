// Keyboard, mouse and pointer-lock handling in one small module. The game
// loop reads `keys` as a Set of KeyboardEvent codes and drains mouse motion
// once per frame through takeLook().
export function createInput(domElement, onLockChange) {
  const keys = new Set();
  const pressed = new Set();
  let lookX = 0;
  let lookY = 0;
  let firing = false;
  let aiming = false;
  let locked = false;

  window.addEventListener('keydown', (ev) => {
    if (!ev.repeat) pressed.add(ev.code);
    keys.add(ev.code);
    if (['Space', 'Tab'].includes(ev.code)) ev.preventDefault();
  });
  window.addEventListener('keyup', (ev) => keys.delete(ev.code));
  window.addEventListener('blur', () => { keys.clear(); firing = false; aiming = false; });

  domElement.addEventListener('mousedown', (ev) => {
    if (!locked) return;
    if (ev.button === 0) firing = true;
    if (ev.button === 2) aiming = true;
  });
  window.addEventListener('mouseup', (ev) => {
    if (ev.button === 0) firing = false;
    if (ev.button === 2) aiming = false;
  });
  domElement.addEventListener('contextmenu', (ev) => ev.preventDefault());
  window.addEventListener('mousemove', (ev) => {
    if (!locked) return;
    lookX += ev.movementX || 0;
    lookY += ev.movementY || 0;
  });
  document.addEventListener('pointerlockchange', () => {
    locked = document.pointerLockElement === domElement;
    if (!locked) { firing = false; aiming = false; }
    onLockChange(locked);
  });

  return {
    keys,
    get firing() { return firing; },
    get aiming() { return aiming; },
    get locked() { return locked; },
    takeLook() {
      const out = { x: lookX, y: lookY };
      lookX = 0; lookY = 0;
      return out;
    },
    // One-shot key presses (buy menu, planting is hold-based elsewhere).
    consume(code) {
      if (pressed.has(code)) { pressed.delete(code); return true; }
      return false;
    },
    clearPressed() { pressed.clear(); },
    requestLock() { domElement.requestPointerLock(); },
  };
}
