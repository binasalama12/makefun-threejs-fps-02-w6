// Dustbowl Relay — boot, round state machine and the fixed-step game loop.
//
// Crews: the Ember Wardens (you, attacking) against the Rustjackals holding
// the relay. A round is won by wiping the other crew, or — for the Wardens —
// by planting the charge on the radio tower and letting it blow. The
// Rustjackals can defuse a planted charge. Money earned in a round buys
// guns and Dustburst Pellets in the buy phase of the next.
//
// Screenshot mode: ?shot=start|play|end&seed=N poses one deterministic
// frame (menu/loadout, mid-round action, final scoreboard), renders it and
// sets window.__shotReady. No pointer lock, no audio, no timers run.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { mulberry32 } from './rng.js';
import { createWorld, PLANT_ZONE, SPAWNS } from './world.js';
import { WEAPONS, GRENADE, weaponById, makeGunState, refillGun } from './weapons.js';
import { createPlayer } from './player.js';
import { createBots } from './bots.js';
import { createInput } from './input.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';
import { createViewModel, createTracers } from './viewmodel.js';

const FIXED_STEP = 1 / 60;
const ROUND_TIME = 100;
const BUY_TIME = 9;
const FUSE_TIME = 14;
const PLANT_TIME = 3;
const DEFUSE_TIME = 3.2;
const WIN_SCORE = 5;
const MAX_ROUNDS = 9;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = (Number.parseInt(params.get('seed') ?? '1', 10) || 1) >>> 0;
const rng = mulberry32(shot ? seed * 7919 + 13 : (Date.now() % 2147483647) + 1);
const audio = createAudio();
const soundOn = !shot;

// ---------- renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 260);
scene.add(camera);

const world = createWorld(scene);
const player = createPlayer(world.colliders, SPAWNS.ally[0]);
const bots = createBots(scene, world.colliders, rng);
const hud = createHud();
const input = createInput(renderer.domElement, onLockChange);
const viewModel = createViewModel(camera);
const tracers = createTracers(scene);
const raycaster = new THREE.Raycaster();

// The plantable charge prop and a reusable explosion light.
const chargeMesh = new THREE.Group();
{
  const boxMesh = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.34, 0.36),
    new THREE.MeshStandardMaterial({ color: PALETTE.metalDark, roughness: 0.5 }));
  boxMesh.position.y = 0.17;
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8),
    new THREE.MeshStandardMaterial({ color: PALETTE.charge, emissive: PALETTE.charge, emissiveIntensity: 2.4 }));
  lamp.position.y = 0.4;
  chargeMesh.add(boxMesh, lamp);
  chargeMesh.position.set(PLANT_ZONE.x + 1.2, 0, PLANT_ZONE.z + 1.2);
  chargeMesh.visible = false;
  scene.add(chargeMesh);
}
const boomLight = new THREE.PointLight(0xffa040, 0, 42);
boomLight.position.set(PLANT_ZONE.x, 3, PLANT_ZONE.z);
scene.add(boomLight);
const grenadeMesh = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 10),
  new THREE.MeshStandardMaterial({ color: PALETTE.ochre, roughness: 0.4 }));
grenadeMesh.visible = false;
scene.add(grenadeMesh);

// ---------- match state (single source of truth) ----------
const S = {
  phase: 'menu', // menu | buy | live | over | matchover
  round: 0, allyScore: 0, enemyScore: 0,
  money: 800, kills: 0, deaths: 0,
  timeLeft: 0, phaseEndsAt: 0,
  planted: false, fuseLeft: 0, plantProgress: 0, lastBeepAt: 0,
  simNow: 0,
  arsenal: new Map(), primaryId: null, slot: 'sidearm',
  grenades: 0,
  started: false,
};
S.arsenal.set('kestrel', makeGunState(weaponById('kestrel')));

function currentGun() {
  if (S.slot === 'primary' && S.primaryId && S.arsenal.has(S.primaryId)) return S.arsenal.get(S.primaryId);
  return S.arsenal.get('kestrel');
}

function buyItems() {
  const items = WEAPONS.map((w) => ({
    name: w.name, desc: w.desc, price: w.price,
    owned: S.arsenal.has(w.id), affordable: S.money >= w.price,
  }));
  items.push({
    name: `${GRENADE.name}  (own ${S.grenades})`, desc: GRENADE.desc, price: GRENADE.price,
    owned: false, affordable: S.money >= GRENADE.price,
  });
  return items;
}

function tryBuy(index) {
  if (index < WEAPONS.length) {
    const def = WEAPONS[index];
    if (S.arsenal.has(def.id)) {
      if (def.slot === 'primary') { S.primaryId = def.id; S.slot = 'primary'; }
      else S.slot = 'sidearm';
      if (soundOn) audio.buy();
      return;
    }
    if (S.money < def.price) { if (soundOn) audio.denied(); return; }
    S.money -= def.price;
    S.arsenal.set(def.id, makeGunState(def));
    if (def.slot === 'primary') { S.primaryId = def.id; S.slot = 'primary'; }
    if (soundOn) audio.buy();
    hud.setMoney(S.money);
    hud.feedLine(`Bought ${def.name}`);
  } else {
    if (S.money < GRENADE.price) { if (soundOn) audio.denied(); return; }
    S.money -= GRENADE.price;
    S.grenades += 1;
    if (soundOn) audio.buy();
    hud.setMoney(S.money);
    hud.feedLine(`Bought ${GRENADE.name} (own ${S.grenades})`);
  }
  refreshAmmoHud();
}

// ---------- round flow ----------
function startMatch() {
  S.round = 0; S.allyScore = 0; S.enemyScore = 0;
  S.money = 800; S.kills = 0; S.deaths = 0;
  S.arsenal.clear();
  S.arsenal.set('kestrel', makeGunState(weaponById('kestrel')));
  S.primaryId = null; S.slot = 'sidearm'; S.grenades = 0;
  hud.clearFeed();
  startRound();
}

function startRound() {
  S.round += 1;
  S.planted = false; S.fuseLeft = 0; S.plantProgress = 0;
  chargeMesh.visible = false;
  boomLight.intensity = 0;
  for (const gun of S.arsenal.values()) refillGun(gun);
  player.respawn(SPAWNS.ally[0]);
  bots.reset(SPAWNS);
  const enemies = bots.bots.filter((b) => b.team === 'enemy');
  if (enemies[2]) enemies[2].holdPoint = { x: -6, z: -28 };
  if (enemies[3]) enemies[3].holdPoint = { x: 6, z: -28 };
  S.phase = 'buy';
  S.timeLeft = BUY_TIME;
  hud.hideScoreboard();
  hud.hidePlant();
  hud.setMoney(S.money);
  hud.setHp(player.state.hp);
  hud.setRound(S.round, MAX_ROUNDS, S.allyScore, S.enemyScore);
  hud.setPhase('BUY PHASE — press 1-6, B to reopen');
  hud.showBuy(buyItems(), S.money);
  hud.banner(`Round ${S.round}`, 'Wardens attack — plant at the radio tower');
  refreshAmmoHud();
}

function endRound(winner, reason) {
  if (S.phase === 'over' || S.phase === 'matchover') return;
  S.phase = 'over';
  S.phaseEndsAt = S.simNow + 4.5;
  hud.hideBuy();
  hud.hidePlant();
  if (winner === 'ally') { S.allyScore += 1; S.money += 2400; if (soundOn) audio.roundWin(); }
  else { S.enemyScore += 1; S.money += 1400; if (soundOn) audio.roundLose(); }
  hud.setMoney(S.money);
  hud.setRound(S.round, MAX_ROUNDS, S.allyScore, S.enemyScore);
  hud.banner(winner === 'ally' ? 'WARDENS TAKE THE ROUND' : 'RUSTJACKALS HOLD', reason);
  hud.setPhase(reason);
  const matchDone = S.allyScore >= WIN_SCORE || S.enemyScore >= WIN_SCORE || S.round >= MAX_ROUNDS;
  if (matchDone) {
    S.phase = 'matchover';
    const won = S.allyScore > S.enemyScore;
    hud.showOverlay('matchEnd', {
      title: won ? 'The relay is yours' : 'The relay stays silent',
      copy: won
        ? `Final ${S.allyScore} — ${S.enemyScore}. The tower sings on Warden frequency tonight.`
        : `Final ${S.allyScore} — ${S.enemyScore}. The Rustjackals keep the tower. Run it back.`,
      rows: finalRows(),
    });
    if (document.pointerLockElement) document.exitPointerLock();
  }
}

function finalRows() {
  return [
    { label: 'Ember Wardens', value: `${S.allyScore} rounds` },
    { label: 'Rustjackals', value: `${S.enemyScore} rounds` },
    { label: 'Your eliminations', value: String(S.kills) },
    { label: 'Times downed', value: String(S.deaths) },
    { label: 'Cash in hand', value: `$${S.money}` },
  ];
}

// ---------- combat ----------
function refreshAmmoHud() {
  const gun = currentGun();
  hud.setAmmo(gun.mag, gun.reserve, `${gun.def.name}${S.grenades ? `  ·  Pellet ×${S.grenades} (G)` : ''}`);
  viewModel.setWeapon(gun.def.id);
}

function currentSpread() {
  const gun = currentGun();
  const def = gun.def;
  let s = def.spread;
  s *= 1 + player.speed() * 0.55;               // moving opens the group up
  if (!player.state.grounded) s *= 2.2;          // airborne shots spray
  if (player.state.crouching) s *= 0.55;         // crouch settles the gun
  if (input.aiming) s *= 0.6;                    // aiming down the sight helps
  s += gun.bloom;                                // sustained fire blooms
  return s;
}

const _dir = new THREE.Vector3();
const _from = new THREE.Vector3();
const _to = new THREE.Vector3();
let prevFiring = false;

function playerShoot() {
  const gun = currentGun();
  const def = gun.def;
  const now = S.simNow;
  if (now < gun.reloadingUntil) return;
  if (now - gun.lastShotAt < def.fireRate / 1000) return;
  if (gun.mag <= 0) {
    if (soundOn) audio.dryFire();
    gun.lastShotAt = now;
    startReload();
    return;
  }
  gun.mag -= 1;
  gun.lastShotAt = now;
  gun.bloom = Math.min(0.05, gun.bloom + def.spread * 0.9);
  if (soundOn) audio.shot(def.id);
  viewModel.fire(performance.now());
  player.recoil(def.kick * (0.8 + rng() * 0.4), (rng() - 0.5) * def.kick * 0.6);

  camera.getWorldDirection(_dir);
  _from.copy(camera.position);
  const spread = currentSpread();
  const targets = world.shootables.concat(bots.hitMeshes());
  raycaster.far = def.range;
  for (let p = 0; p < def.pellets; p += 1) {
    const d = _dir.clone();
    d.x += (rng() * 2 - 1) * spread;
    d.y += (rng() * 2 - 1) * spread;
    d.z += (rng() * 2 - 1) * spread;
    d.normalize();
    raycaster.set(camera.position, d);
    const hit = raycaster.intersectObjects(targets, false)[0];
    if (hit) {
      _to.copy(hit.point);
      const bot = hit.object.userData.bot;
      if (bot && bot.alive) {
        const part = hit.object.userData.part;
        let dmg = def.damage * (part === 'head' ? def.headMult : 1);
        if (hit.distance > 42) dmg *= 0.75;
        const killed = bots.damage(bot, dmg);
        hud.hitMarker(killed);
        if (soundOn) audio.hit(killed);
        if (killed) {
          S.kills += 1;
          S.money += 300;
          hud.setMoney(S.money);
          hud.feedLine(`You dropped ${bot.name}  +$300`);
          checkElimination();
        }
      }
    } else {
      _to.copy(camera.position).addScaledVector(d, def.range);
    }
    tracers.spawn(_from, _to, performance.now());
  }
  refreshAmmoHud();
}

function startReload() {
  const gun = currentGun();
  if (gun.mag >= gun.def.mag || gun.reserve <= 0) return;
  if (S.simNow < gun.reloadingUntil) return;
  gun.reloadingUntil = S.simNow + gun.def.reloadMs / 1000;
  if (soundOn) audio.reload();
}

function finishReloadIfReady() {
  const gun = currentGun();
  if (gun.reloadingUntil && S.simNow >= gun.reloadingUntil) {
    const need = gun.def.mag - gun.mag;
    const take = Math.min(need, gun.reserve);
    gun.mag += take;
    gun.reserve -= take;
    gun.reloadingUntil = 0;
    refreshAmmoHud();
  }
}

function damagePlayer(amount, attackerName) {
  if (!player.state.alive || S.phase !== 'live') return;
  player.state.hp -= amount;
  hud.setHp(player.state.hp);
  hud.hurtFlash();
  if (soundOn) audio.hurt();
  if (player.state.hp <= 0) {
    player.state.alive = false;
    S.deaths += 1;
    hud.feedLine(`${attackerName} downed you`);
    hud.banner('YOU ARE DOWN', 'Your crew fights on without you');
    checkElimination();
  }
}

function checkElimination() {
  if (S.phase !== 'live') return;
  const enemiesAlive = bots.aliveCount('enemy');
  const alliesAlive = bots.aliveCount('ally') + (player.state.alive ? 1 : 0);
  if (enemiesAlive === 0) endRound('ally', 'Rustjackals eliminated');
  else if (alliesAlive === 0 && !S.planted) endRound('enemy', 'Wardens eliminated');
}

// Bot gunfire resolved by probability, honest about distance and movement.
function onBotShoot(bot, target, dist) {
  const nowMs = performance.now();
  const from = _from.set(bot.pos.x, 1.35, bot.pos.z);
  const targetSpeed = target.isPlayer ? player.speed() : 2;
  let chance = 0.60 - dist * 0.008 - targetSpeed * 0.045;
  if (target.isPlayer && player.state.crouching) chance -= 0.07;
  chance = Math.max(0.07, Math.min(0.58, chance));
  const hit = rng() < chance;
  const aimY = target.isPlayer ? player.state.eye - 0.25 : 1.15;
  _to.set(target.pos.x + (hit ? 0 : (rng() - 0.5) * 3), aimY, target.pos.z + (hit ? 0 : (rng() - 0.5) * 3));
  tracers.spawn(from.clone(), _to.clone(), nowMs, bot.team === 'ally' ? 0xffe9a8 : 0xff9a7a);
  if (dist < 32 && soundOn) audio.botShot();
  if (!hit) return;
  const dmg = bot.team === 'enemy' ? 10 + rng() * 6 : 12 + rng() * 6;
  if (target.isPlayer) damagePlayer(dmg, bot.name);
  else if (target.bot) {
    const killed = bots.damage(target.bot, dmg);
    if (killed) {
      hud.feedLine(`${bot.name} dropped ${target.bot.name}`);
      checkElimination();
    }
  }
}

// ---------- grenade ----------
const grenade = { active: false, pos: new THREE.Vector3(), vel: new THREE.Vector3() };
function throwGrenade() {
  if (S.grenades <= 0 || grenade.active || S.phase !== 'live') return;
  S.grenades -= 1;
  camera.getWorldDirection(_dir);
  grenade.pos.copy(camera.position);
  grenade.vel.copy(_dir).multiplyScalar(15);
  grenade.vel.y += 4.5;
  grenade.active = true;
  grenadeMesh.visible = true;
  refreshAmmoHud();
}

function stepGrenade(dt) {
  if (!grenade.active) return;
  grenade.vel.y -= 16 * dt;
  grenade.pos.addScaledVector(grenade.vel, dt);
  if (grenade.pos.y <= 0.14) {
    grenade.active = false;
    grenadeMesh.visible = false;
    if (soundOn) audio.grenade();
    boomLight.position.set(grenade.pos.x, 1.6, grenade.pos.z);
    boomLight.intensity = 60;
    for (const bot of bots.bots) {
      if (!bot.alive || bot.team !== 'enemy') continue;
      const d = Math.hypot(bot.pos.x - grenade.pos.x, bot.pos.z - grenade.pos.z);
      if (d < 7.5) {
        bot.blindUntil = S.simNow + 3.5;
        bot.staggerUntil = S.simNow + 1.1;
        const killed = bots.damage(bot, 26);
        hud.feedLine(killed ? `Dustburst dropped ${bot.name}` : `${bot.name} is blinded by dust`);
        if (killed) { S.kills += 1; checkElimination(); }
      }
    }
  } else {
    grenadeMesh.position.copy(grenade.pos);
  }
}

// ---------- planting / defusing ----------
function stepPlant(dt) {
  if (S.planted) {
    S.fuseLeft -= dt;
    hud.setTimer(S.fuseLeft);
    hud.setPhase('CHARGE PLANTED — defend the tower');
    chargeMesh.visible = true;
    if (S.fuseLeft <= 0) {
      if (soundOn) audio.explosion();
      boomLight.position.set(PLANT_ZONE.x, 3, PLANT_ZONE.z);
      boomLight.intensity = 220;
      endRound('ally', 'Charge detonated on the radio tower');
    }
    return;
  }
  const inZone = Math.hypot(player.state.position.x - PLANT_ZONE.x, player.state.position.z - PLANT_ZONE.z) < PLANT_ZONE.radius;
  if (S.phase === 'live' && player.state.alive && inZone) {
    hud.setHint('Hold E to plant the charge');
    if (input.keys.has('KeyE')) {
      S.plantProgress += dt / PLANT_TIME;
      if (S.simNow - S.lastBeepAt > 0.7) { S.lastBeepAt = S.simNow; if (soundOn) audio.plantBeep(); }
      hud.showPlant(S.plantProgress, 'PLANTING THE CHARGE…');
      if (S.plantProgress >= 1) {
        S.planted = true;
        S.fuseLeft = FUSE_TIME;
        S.money += 300;
        hud.setMoney(S.money);
        hud.hidePlant();
        hud.banner('CHARGE PLANTED', `${FUSE_TIME} seconds to detonation`);
        if (soundOn) audio.planted();
      }
    } else {
      S.plantProgress = Math.max(0, S.plantProgress - dt * 0.8);
      if (S.plantProgress > 0) hud.showPlant(S.plantProgress, 'PLANTING THE CHARGE…');
      else hud.hidePlant();
    }
  } else {
    if (S.plantProgress > 0) { S.plantProgress = 0; hud.hidePlant(); }
    if (S.phase === 'live') hud.setHint('');
  }
}

const botCtx = {
  get playerState() { return player.state; },
  get planted() { return S.planted; },
  rng,
  onBotShoot,
  onDefuseProgress() { hud.showPlant(0, 'A Rustjackal is defusing!'); },
  onDefused() {
    S.planted = false;
    chargeMesh.visible = false;
    hud.hidePlant();
    endRound('enemy', 'The charge was defused at the tower');
  },
};

// ---------- simulation step (fixed 60 Hz) ----------
function step(dt) {
  S.simNow += dt;
  const frozen = S.phase === 'buy' || S.phase === 'over' || S.phase === 'matchover' || S.phase === 'menu';
  player.step(dt, input.keys, frozen || !player.state.alive);
  // Tuning pass: bloom settles twice as fast while crouched, so a settled
  // crouched shooter recovers their tight group between bursts.
  const bloomDecay = player.state.crouching && player.state.grounded ? 0.07 : 0.035;
  for (const gun of S.arsenal.values()) gun.bloom = Math.max(0, gun.bloom - dt * bloomDecay);
  finishReloadIfReady();

  if (S.phase === 'buy') {
    S.timeLeft -= dt;
    hud.setTimer(S.timeLeft);
    if (S.timeLeft <= 0) {
      S.phase = 'live';
      S.timeLeft = ROUND_TIME;
      hud.hideBuy();
      hud.setPhase('LIVE — plant at the tower or eliminate the Rustjackals');
      hud.banner('ROUND LIVE', 'First to plant and detonate, or last crew standing');
    }
  } else if (S.phase === 'live') {
    bots.step(dt, S.simNow, botCtx);
    stepGrenade(dt);
    stepPlant(dt);
    if (!S.planted) {
      S.timeLeft -= dt;
      hud.setTimer(S.timeLeft);
      if (S.timeLeft <= 0) endRound('enemy', 'Time — the relay held');
    }
  }
}

// ---------- per-frame glue ----------
function syncCamera() {
  const b = player.state;
  const eyeY = b.alive ? b.eye : 0.55;
  camera.position.set(b.position.x, eyeY, b.position.z);
  camera.rotation.set(b.pitch, b.yaw, b.alive ? 0 : 0.35, 'YXZ');
}

function handleKeys() {
  if (S.phase === 'buy') {
    for (let i = 0; i < 6; i += 1) {
      if (input.consume(`Digit${i + 1}`) || input.consume(`Numpad${i + 1}`)) {
        tryBuy(i);
        hud.showBuy(buyItems(), S.money);
      }
    }
  }
  if (S.phase === 'live' || S.phase === 'buy') {
    if (input.consume('Digit1')) S.slot = 'sidearm';
    if (input.consume('Digit2') && S.primaryId) S.slot = 'primary';
    if (input.consume('KeyB') && S.phase === 'buy') hud.showBuy(buyItems(), S.money);
    if (input.consume('KeyR')) startReload();
    if (input.consume('KeyG')) throwGrenade();
    refreshAmmoHud();
  }
  input.clearPressed();
}

let accumulator = 0;
let lastTime = performance.now();
let frozenFrame = false;

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozenFrame) {
    const look = input.takeLook();
    if (input.locked || shot) player.look(look.x, look.y);
    handleKeys();
    if (input.firing && !prevFiring || (input.firing && currentGun().def.auto)) {
      if (S.phase === 'live' && player.state.alive && input.locked) playerShoot();
    }
    prevFiring = input.firing;
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) { step(FIXED_STEP); accumulator -= FIXED_STEP; steps += 1; }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    if (S.phase === 'over' && S.simNow >= S.phaseEndsAt) startRound();
    // ADS zoom easing.
    const targetFov = input.aiming && input.locked ? 74 / currentGun().def.zoom : 74;
    if (Math.abs(camera.fov - targetFov) > 0.2) {
      camera.fov += (targetFov - camera.fov) * 0.3;
      camera.updateProjectionMatrix();
    }
    viewModel.setAiming(input.aiming && input.locked);
    viewModel.update(now, player.speed(), dt);
    tracers.update(now);
    boomLight.intensity *= Math.pow(0.02, dt);
    world.beacon.material.emissiveIntensity = 1.3 + Math.sin(now * 0.004) * 0.7;
    syncCamera();
  }
  renderer.render(scene, camera);
}

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    S.started = true;
    hud.hideOverlay();
    if (soundOn) audio.unlock();
  } else if (S.phase !== 'matchover' && S.started) {
    hud.showOverlay('paused');
  }
}

hud.onPlay(() => {
  if (shot) return;
  if (S.phase === 'matchover') startMatch();
  else if (S.phase === 'menu') { S.phase = 'buy'; startMatch(); }
  input.requestLock();
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- screenshot poses ----------
function poseBots(list) {
  for (const [team, index, x, z, yaw] of list) {
    const bot = bots.bots.filter((b) => b.team === team)[index];
    if (!bot) continue;
    bot.pos.x = x; bot.pos.z = z; bot.yaw = yaw;
    bot.group.position.set(x, 0, z);
    bot.group.rotation.y = yaw;
  }
}

function runShot(name) {
  hud.hideOverlay();
  if (name === 'start') {
    S.phase = 'buy'; S.round = 1; S.money = 2450;
    S.arsenal.set('carbine', makeGunState(weaponById('carbine')));
    S.primaryId = 'carbine'; S.slot = 'primary'; S.grenades = 1;
    player.respawn({ x: 0, z: 34 });
    player.state.yaw = 0; player.state.pitch = 0.02;
    bots.reset(SPAWNS);
    poseBots([
      ['ally', 0, -3.5, 30, 0], ['ally', 1, 4, 31, 0],
      ['enemy', 0, -8, -44, Math.PI], ['enemy', 1, 8, -44, Math.PI],
    ]);
    hud.setHp(100); hud.setMoney(S.money);
    hud.setRound(1, MAX_ROUNDS, 0, 0);
    hud.setTimer(BUY_TIME); hud.setPhase('BUY PHASE — press 1-6, B to reopen');
    hud.showBuy(buyItems(), S.money);
    refreshAmmoHud();
  } else if (name === 'play') {
    S.phase = 'live'; S.round = 3; S.allyScore = 2; S.enemyScore = 1; S.money = 3150;
    S.arsenal.set('carbine', makeGunState(weaponById('carbine')));
    S.primaryId = 'carbine'; S.slot = 'primary'; S.grenades = 1;
    const gun = currentGun(); gun.mag = 19;
    player.respawn({ x: 5, z: 10 });
    player.state.yaw = 0; player.state.pitch = 0.03; player.state.hp = 78;
    bots.reset(SPAWNS);
    poseBots([
      ['ally', 0, -3, 13, 0.2], ['ally', 1, 11, 14, -0.3],
      ['enemy', 0, 5.5, -0.5, Math.PI], ['enemy', 1, 13, 4, Math.PI - 0.5],
      ['enemy', 2, -9, -3, Math.PI + 0.4],
    ]);
    bots.bots.filter((b) => b.team === 'enemy')[0].hp = 55;
    hud.setHp(78); hud.setMoney(S.money);
    hud.setRound(3, MAX_ROUNDS, 2, 1);
    hud.setTimer(72); hud.setPhase('LIVE — plant at the tower or eliminate the Rustjackals');
    hud.feedLine('Sable dropped Mire');
    hud.feedLine('You dropped Hask  +$300');
    hud.hitMarker(false);
    refreshAmmoHud();
    viewModel.fire(performance.now());
    _from.set(5, 1.5, 10); _to.set(5.5, 1.35, -0.5);
    tracers.spawn(_from.clone(), _to.clone(), performance.now() + 60000);
  } else { // end
    S.phase = 'matchover'; S.round = 8; S.allyScore = 5; S.enemyScore = 3;
    S.money = 4600; S.kills = 11; S.deaths = 4; S.planted = true;
    chargeMesh.visible = true;
    player.respawn({ x: 0, z: -30 });
    player.state.yaw = 0; player.state.pitch = 0.05;
    bots.reset(SPAWNS);
    poseBots([
      ['ally', 0, -4, -33, 0], ['ally', 1, 4.5, -34, 0],
      ['enemy', 0, -8, -44, Math.PI], ['enemy', 1, 8, -44, Math.PI],
    ]);
    const dead = bots.bots.filter((b) => b.team === 'enemy')[2];
    if (dead) { dead.alive = false; dead.group.rotation.z = Math.PI / 2; dead.group.position.y = 0.25; }
    hud.setHp(64); hud.setMoney(S.money);
    hud.setRound(8, MAX_ROUNDS, 5, 3);
    hud.setTimer(0); hud.setPhase('Charge detonated on the radio tower');
    hud.banner('WARDENS TAKE THE RELAY', 'Final round — charge detonated');
    hud.showScoreboard(finalRows(), 'Final scoreboard');
    refreshAmmoHud();
  }
  syncCamera();
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozenFrame = true;
    }
  }
  requestAnimationFrame(paint);
}

// ---------- boot ----------
syncCamera();
if (shot) {
  runShot(shot);
} else {
  hud.showOverlay('start');
  hud.setHp(100); hud.setMoney(S.money);
  hud.setRound(1, MAX_ROUNDS, 0, 0);
  hud.setTimer(BUY_TIME); hud.setPhase('Dustbowl Relay — Ember Wardens vs Rustjackals');
  refreshAmmoHud();
  requestAnimationFrame(frame);
}
