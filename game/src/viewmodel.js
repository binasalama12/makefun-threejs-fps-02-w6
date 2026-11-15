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
    const tx = aiming ? 0 : 0.28;
    const ty = aiming ? -0.185 : -0.24;
    group.position.x += (tx - group.position.x) * 0.35;
    group.position.y += (ty - group.position.y) * 0.35;
  }

  function fire(now) {
    flash.intensity = 14;
    flashQuad.material.opacity = 0.9;
    flashQuad.rotation.z = Math.random() * Math.PI;
    flashUntil = now + 45;
    group.position.z = -0.48;
  }

  function update(now, speed, dt) {
    if (now > flashUntil) { flash.intensity = 0; flashQuad.material.opacity = 0; }
    group.position.z += (-0.55 - group.position.z) * 0.4;
    bobT += dt * (2 + speed * 1.6);
    const sway = Math.min(speed, 6) * 0.006;
    group.position.y += Math.sin(bobT * 2) * sway * 0.12;
    group.rotation.z = Math.sin(bobT) * sway * 0.25;
  }

  return { setWeapon, setAiming, fire, update, group };
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
