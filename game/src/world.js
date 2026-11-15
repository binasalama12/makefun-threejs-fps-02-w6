// Dustbowl Relay map: a desert relay station built from boxes and cylinders.
// Layout (top-down, north is -Z):
//   - Radio tower and its fenced plant yard at the far north.
//   - The relay station building mid-map: two rooms, a hall, and two narrow
//     doorways that act as the choke points.
//   - A tanker wagon row across the middle giving hard cover on the long
//     east-west sightline.
//   - Attacker yard in the south, defender yard by the tower.
// Collision is a list of axis-aligned boxes; movement resolves against them,
// and the same list blocks bot line-of-sight checks.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const PLANT_ZONE = { x: 0, z: -40, radius: 6 };
export const WAYPOINTS = [
  { x: -14, z: 30 }, { x: 0, z: 26 }, { x: 14, z: 30 },
  { x: -16, z: 12 }, { x: 0, z: 10 }, { x: 16, z: 12 },
  { x: -8, z: -2 }, { x: 8, z: -2 },
  { x: -3.2, z: -10 }, { x: 3.2, z: -10 },
  { x: -12, z: -18 }, { x: 12, z: -18 },
  { x: -6, z: -28 }, { x: 6, z: -28 },
  { x: 0, z: -36 }, { x: -10, z: -40 }, { x: 10, z: -40 },
];
export const SPAWNS = {
  ally: [{ x: -6, z: 36 }, { x: 0, z: 38 }, { x: 6, z: 36 }],
  enemy: [{ x: -8, z: -44 }, { x: 8, z: -44 }, { x: -3, z: -33 }, { x: 4, z: -30 }],
};

function mat(color, rough = 0.92) {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0.04 });
}

export function createWorld(scene) {
  const colliders = []; // {minX,maxX,minZ,maxZ,h} — h used for sight checks
  const shootables = [];

  function box(x, z, w, d, h, color, opts = {}) {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(geo, mat(color, opts.rough ?? 0.92));
    mesh.position.set(x, h / 2 + (opts.y || 0), z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    shootables.push(mesh);
    if (!opts.noCollide) colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, h: (opts.y || 0) + h });
    return mesh;
  }

  // Sky, light and ground.
  scene.background = new THREE.Color(PALETTE.sky);
  scene.fog = new THREE.Fog(new THREE.Color(PALETTE.fog), 55, 135);
  const sun = new THREE.DirectionalLight(0xffe3b0, 2.6);
  sun.position.set(38, 52, 20);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -60; sun.shadow.camera.right = 60;
  sun.shadow.camera.top = 60; sun.shadow.camera.bottom = -60;
  sun.shadow.camera.far = 160;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xffe0b8, 0x8a6a42, 0.95));

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(150, 150), mat(PALETTE.sand, 1));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  shootables.push(ground);
  // Worn track strip down the middle lane.
  const track = new THREE.Mesh(new THREE.PlaneGeometry(9, 96), mat(PALETTE.sandDark, 1));
  track.rotation.x = -Math.PI / 2;
  track.position.set(0, 0.02, -2);
  track.receiveShadow = true;
  scene.add(track);

  // Perimeter berm: low walls keep everyone inside the bowl.
  box(0, -52, 110, 2, 3.2, PALETTE.sandDark);
  box(0, 48, 110, 2, 3.2, PALETTE.sandDark);
  box(-52, -2, 2, 102, 3.2, PALETTE.sandDark);
  box(52, -2, 2, 102, 3.2, PALETTE.sandDark);

  // --- Relay station (mid-map choke) ---
  // Back wall with a single central doorway gap.
  box(-8.5, -14, 11, 1.2, 4.6, PALETTE.brick);
  box(8.5, -14, 11, 1.2, 4.6, PALETTE.brick);
  box(0, -14, 6, 1.2, 1.4, PALETTE.brickDark, { y: 3.2 }); // lintel over the door
  // Front wall with two doorways.
  box(-11, 2, 8, 1.2, 4.6, PALETTE.brick);
  box(0, 2, 6, 1.2, 4.6, PALETTE.brick);
  box(11, 2, 8, 1.2, 4.6, PALETTE.brick);
  // Side walls and an interior divider splitting the hall in two rooms.
  box(-15, -6, 1.2, 17, 4.6, PALETTE.brickDark);
  box(15, -6, 1.2, 17, 4.6, PALETTE.brickDark);
  box(0, -9, 1.2, 9, 3.8, PALETTE.canvasCloth);
  // Flat roof beams (visual only, high enough to never block sight at eye
  // level). Kept slim after the first playtest captures: chunky slabs read
  // as floating blocks from the yard, thin beams read as a roof frame.
  for (const bx of [-12, -6, 0, 6, 12]) box(bx, -6, 1.1, 18, 0.32, PALETTE.rust, { y: 4.6, noCollide: true });
  // Crates inside the station.
  box(-10, -11, 2.2, 2.2, 1.6, PALETTE.rust);
  box(9, -4, 2.2, 2.2, 1.6, PALETTE.rust);
  box(10.4, -4, 1.6, 1.6, 1.1, PALETTE.ochre);

  // --- Tanker wagon row (mid cover) ---
  const tankerMat = mat(PALETTE.brick, 0.55);
  for (const tx of [-13, 0, 13]) {
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.7, 8.5, 18), tankerMat);
    tank.rotation.z = Math.PI / 2;
    tank.position.set(tx, 1.9, 16);
    tank.castShadow = true; tank.receiveShadow = true;
    scene.add(tank);
    shootables.push(tank);
    colliders.push({ minX: tx - 4.25, maxX: tx + 4.25, minZ: 14.4, maxZ: 17.6, h: 3.6 });
    box(tx - 3, 16, 1.1, 2.6, 0.8, PALETTE.metalDark);
    box(tx + 3, 16, 1.1, 2.6, 0.8, PALETTE.metalDark);
  }

  // Scattered cover: crates, barrels, sandbag lines, a broken cart.
  const cover = [
    [-20, 24, 2.4, 2.4, 1.7], [20, 24, 2.4, 2.4, 1.7], [-22, -24, 2.4, 2.4, 1.7],
    [22, -24, 2.4, 2.4, 1.7], [-18, -34, 3.2, 1.4, 1.2], [18, -34, 3.2, 1.4, 1.2],
    [-24, 4, 1.6, 4.5, 1.2], [24, 4, 1.6, 4.5, 1.2], [-7, 30, 4.2, 1.3, 1.15],
    [7, 30, 4.2, 1.3, 1.15], [-16, -6, 2, 2, 1.4], [19, -12, 2, 2, 1.4],
  ];
  for (const [x, z, w, d, h] of cover) box(x, z, w, d, h, PALETTE.rust);
  for (const [x, z] of [[-26, 18], [-25, 19.4], [26, -18], [27, -16.6], [-12, -24], [12, 26]]) {
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 1.5, 12), mat(PALETTE.ochre, 0.6));
    barrel.position.set(x, 0.75, z);
    barrel.castShadow = true;
    scene.add(barrel);
    shootables.push(barrel);
    colliders.push({ minX: x - 0.62, maxX: x + 0.62, minZ: z - 0.62, maxZ: z + 0.62, h: 1.5 });
  }

  // --- Radio tower + plant yard (north objective) ---
  const towerMat = mat(PALETTE.metalDark, 0.5);
  for (const [lx, lz] of [[-2.6, -42.6], [2.6, -42.6], [-2.6, -37.4], [2.6, -37.4]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.45, 17, 0.45), towerMat);
    leg.position.set(lx, 8.5, lz);
    leg.castShadow = true;
    scene.add(leg);
    shootables.push(leg);
    colliders.push({ minX: lx - 0.3, maxX: lx + 0.3, minZ: lz - 0.3, maxZ: lz + 0.3, h: 17 });
  }
  for (let lvl = 0; lvl < 4; lvl += 1) {
    const y = 3.4 + lvl * 4;
    const s = 5.4 - lvl * 0.85;
    const ring = new THREE.Mesh(new THREE.BoxGeometry(s, 0.3, s), towerMat);
    ring.position.set(0, y, -40);
    scene.add(ring);
  }
  const dish = new THREE.Mesh(new THREE.SphereGeometry(1.7, 14, 8, 0, Math.PI * 2, 0, 1.1), mat(PALETTE.metal, 0.4));
  dish.position.set(0, 15.6, -40);
  dish.rotation.x = Math.PI / 3;
  scene.add(dish);
  const beaconMat = new THREE.MeshStandardMaterial({ color: PALETTE.charge, emissive: PALETTE.charge, emissiveIntensity: 1.6 });
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 10), beaconMat);
  beacon.position.set(0, 17.4, -40);
  scene.add(beacon);
  // Relay control hut beside the tower and the plant-zone ring on the ground.
  box(-8, -40, 5, 4, 3, PALETTE.brick);
  box(8.5, -38, 4, 3, 2.4, PALETTE.canvasCloth);
  const ringGeo = new THREE.RingGeometry(PLANT_ZONE.radius - 0.35, PLANT_ZONE.radius, 40);
  const zoneRing = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: PALETTE.charge, transparent: true, opacity: 0.75, side: THREE.DoubleSide }));
  zoneRing.rotation.x = -Math.PI / 2;
  zoneRing.position.set(PLANT_ZONE.x, 0.04, PLANT_ZONE.z);
  scene.add(zoneRing);

  // Distant mesas so the horizon is not empty.
  for (const [x, z, w, h] of [[-85, -95, 60, 16], [70, -100, 80, 22], [0, -120, 120, 12], [-100, 20, 40, 10], [100, 30, 46, 13]]) {
    const mesa = new THREE.Mesh(new THREE.BoxGeometry(w, h, 18), mat(PALETTE.sandDark, 1));
    mesa.position.set(x, h / 2, z);
    scene.add(mesa);
  }

  return { colliders, shootables, beacon, zoneRing };
}

// Circle-vs-AABB collision: push (x,z) out of every collider it overlaps.
export function collide(colliders, pos, radius) {
  for (const c of colliders) {
    const nx = Math.max(c.minX, Math.min(pos.x, c.maxX));
    const nz = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
    const dx = pos.x - nx;
    const dz = pos.z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 < radius * radius) {
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        pos.x = nx + (dx / d) * radius;
        pos.z = nz + (dz / d) * radius;
      } else {
        // Centre inside the box: leave through the nearest face.
        const left = pos.x - c.minX, right = c.maxX - pos.x;
        const near = pos.z - c.minZ, far = c.maxZ - pos.z;
        const m = Math.min(left, right, near, far);
        if (m === left) pos.x = c.minX - radius;
        else if (m === right) pos.x = c.maxX + radius;
        else if (m === near) pos.z = c.minZ - radius;
        else pos.z = c.maxZ + radius;
      }
    }
  }
  pos.x = Math.max(-49, Math.min(49, pos.x));
  pos.z = Math.max(-49, Math.min(45, pos.z));
}

// True when the straight line between two eye-height points stays clear of
// every collider tall enough to block sight. Used for bot vision.
export function lineOfSight(colliders, ax, az, bx, bz, eyeH = 1.45) {
  for (const c of colliders) {
    if (c.h < eyeH) continue;
    if (segmentHitsBox(ax, az, bx, bz, c)) return false;
  }
  return true;
}

function segmentHitsBox(x1, z1, x2, z2, c) {
  let tmin = 0, tmax = 1;
  const dx = x2 - x1, dz = z2 - z1;
  if (Math.abs(dx) < 1e-9) { if (x1 < c.minX || x1 > c.maxX) return false; }
  else {
    let t1 = (c.minX - x1) / dx, t2 = (c.maxX - x1) / dx;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return false;
  }
  if (Math.abs(dz) < 1e-9) { if (z1 < c.minZ || z1 > c.maxZ) return false; }
  else {
    let t1 = (c.minZ - z1) / dz, t2 = (c.maxZ - z1) / dz;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return false;
  }
  return true;
}
