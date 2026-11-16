// The held weapon: a low-poly view model parented to the camera, rebuilt
// whenever the carried gun changes, with a muzzle flash light and a short
// tracer line on every shot. Pure presentation — all ballistics live in
// main.js.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const SHAPES = {
  kestrel: { body: [0.09, 0.13, 0.34], barrel: 0.16, color: PALETTE.metal },
  grit: { body: [0.11, 0.16, 0.52], barrel: 0.2, color: PALETTE.metalDark },
  scatter: { body: [0.12, 0.15, 0.62], barrel: 0.3, color: PALETTE.rust },
  carbine: { body: [0.1, 0.17, 0.66], barrel: 0.3, color: PALETTE.brickDark },
  longwire: { body: [0.09, 0.15, 0.92], barrel: 0.46, color: PALETTE.metalDark },
};

export function createViewModel(camera) {
  const group = new THREE.Group();
  group.position.set(0.28, -0.24, -0.55);
  camera.add(group);
  const flash = new THREE.PointLight(0xffc46b, 0, 9);
  flash.position.set(0, 0.05, -1.1);
  group.add(flash);
  const flashQuad = new THREE.Mesh(
    new THREE.PlaneGeometry(0.2, 0.2),
    new THREE.MeshBasicMaterial({ color: 0xffb84d, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  flashQuad.position.set(0, 0.03, -1.05);
  group.add(flashQuad);

  let currentId = null;
  let flashUntil = 0;
  let bobT = 0;
  // Juice state (round 2), all scalar — nothing allocated per frame.
  // baseX/baseY ease between the hip and ADS anchor points; the recoil
  // spring (recoilPos/recoilVel) is kicked by fire() and settles back;
  // lookSway is fed by trackLook() with raw mouse deltas and decays, so
  // the gun lags a touch behind a fast flick and then catches up.
  let aimingNow = false;
  let baseX = 0.28, baseY = -0.24;
  let recoilPos = 0, recoilVel = 0;
  let lookSwayX = 0, lookSwayY = 0;

  function setWeapon(id) {
    if (id === currentId) return;
    currentId = id;
    while (group.children.length > 2) group.remove(group.children[2]);
    const shape = SHAPES[id] || SHAPES.kestrel;
    const matBody = new THREE.MeshStandardMaterial({ color: shape.color, roughness: 0.5, metalness: 0.3 });
    const matDark = new THREE.MeshStandardMaterial({ color: PALETTE.metalDark, roughness: 0.6 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(...shape.body), matBody);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, shape.barrel, 8), matDark);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.04, -(shape.body[2] / 2 + shape.barrel / 2));
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.2, 0.1), matDark);
    grip.position.set(0, -0.15, 0.08);
    grip.rotation.x = 0.3;
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.18, 0.09), matDark);
    mag.position.set(0, -0.15, -0.08);
    if (id === 'longwire') {
      const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.22, 8), matDark);
      scope.rotation.x = Math.PI / 2;
      scope.position.set(0, 0.13, -0.1);
      group.add(scope);
    }
    group.add(body, barrel, grip, mag);
  }

  function setAiming(aiming) {
    aimingNow = aiming;
  }

  // Raw mouse delta from main.js each frame; converted to a small lag
  // offset opposite the flick direction, clamped so big flicks stay sane.
  function trackLook(dx, dy) {
    lookSwayX = Math.max(-0.04, Math.min(0.04, lookSwayX - dx * 0.00006));
    lookSwayY = Math.max(-0.03, Math.min(0.03, lookSwayY + dy * 0.00005));
  }

  function fire(now, kick = 0.011) {
    flash.intensity = 14;
    flashQuad.material.opacity = 0.9;
    flashQuad.rotation.z = Math.random() * Math.PI;
    flashUntil = now + 45;
    // Recoil kick: an impulse into the spring; heavier guns kick harder.
    recoilVel += 0.35 + kick * 60;
  }

  function update(now, speed, dt) {
    if (now > flashUntil) { flash.intensity = 0; flashQuad.material.opacity = 0; }
    const stepDt = Math.min(dt, 0.033);
    // Anchor easing (hip <-> ADS).
    const tx = aimingNow ? 0 : 0.28;
    const ty = aimingNow ? -0.185 : -0.24;
    const ease = Math.min(1, stepDt * 14);
    baseX += (tx - baseX) * ease;
    baseY += (ty - baseY) * ease;
    // Recoil spring, two substeps so it stays stable at low frame rates.
    for (let i = 0; i < 2; i += 1) {
      const h = stepDt / 2;
      recoilVel += (-190 * recoilPos - 16 * recoilVel) * h;
      recoilPos += recoilVel * h;
    }
    // Look sway decays back to centre.
    const decay = Math.pow(0.002, stepDt);
    lookSwayX *= decay;
    lookSwayY *= decay;
    // Walk bob: a pure function of bobT (no accumulation into position,
    // so it can never drift), scaled by actual movement speed.
    bobT += stepDt * speed * 1.9;
    const bobAmp = Math.min(speed, 6) * 0.0035 * (aimingNow ? 0.35 : 1);
    const bobX = Math.cos(bobT) * bobAmp * 0.6;
    const bobY = -Math.abs(Math.sin(bobT)) * bobAmp;
    group.position.set(
      baseX + bobX + lookSwayX,
      baseY + bobY + lookSwayY,
      -0.55 + recoilPos,
    );
    group.rotation.set(recoilPos * 0.85, lookSwayX * 1.3, Math.sin(bobT) * bobAmp * 0.7 + lookSwayX * 0.9);
  }

  return { setWeapon, setAiming, fire, update, trackLook, group };
}

// Short-lived tracer + impact puff pool, reused so the hot loop allocates
// nothing per shot.
export function createTracers(scene) {
  const pool = [];
  for (let i = 0; i < 24; i += 1) {
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffd98a, transparent: true, opacity: 0 }));
    line.visible = false;
    scene.add(line);
    pool.push({ line, until: 0 });
  }
  let cursor = 0;
  return {
    spawn(from, to, now, color = 0xffd98a) {
      const item = pool[cursor];
      cursor = (cursor + 1) % pool.length;
      const pos = item.line.geometry.attributes.position;
      pos.setXYZ(0, from.x, from.y, from.z);
      pos.setXYZ(1, to.x, to.y, to.z);
      pos.needsUpdate = true;
      item.line.material.color.setHex(color);
      item.line.material.opacity = 0.85;
      item.line.visible = true;
      item.until = now + 70;
    },
    update(now) {
      for (const item of pool) {
        if (item.line.visible && now > item.until) item.line.visible = false;
      }
    },
  };
}
