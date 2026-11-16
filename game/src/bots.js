// Bot fighters for both crews. Each bot is a simple state machine:
//   patrol  — walk the waypoint loop toward its assigned lane
//   engage  — it can see a foe: strafe a little, fire bursts with spread
//   hold    — defenders settle on a strong point near the tower yard
//   task    — attackers push the plant zone; a defender with a clear run
//             moves to defuse a planted charge
// Vision is a range + line-of-sight test against the world's colliders, so
// bots honestly cannot see through the station walls or the tankers.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { collide, lineOfSight, WAYPOINTS, PLANT_ZONE } from './world.js';

const BOT_SPEED = 3.4;
const SIGHT_RANGE = 46;
const EYE = 1.5;
// Hearing and witness senses (round 2): gunfire carries through the yard
// even around corners, so HEARING_RADIUS needs no line of sight; seeing a
// teammate fall does. An alert is remembered for a few seconds, then the
// bot falls back to its objective behaviour.
const HEARING_RADIUS = 30;
const WITNESS_RADIUS = 34;
const ALERT_MEMORY = 4.5;

const NAMES = {
  ally: ['Sable', 'Ondo'],
  enemy: ['Vex', 'Mire', 'Hask', 'Juno'],
};

function buildFigure(team) {
  const group = new THREE.Group();
  const main = team === 'ally' ? PALETTE.ally : PALETTE.enemy;
  const dark = team === 'ally' ? PALETTE.allyDark : PALETTE.enemyDark;
  const cloth = new THREE.MeshStandardMaterial({ color: main, roughness: 0.9 });
  const clothDark = new THREE.MeshStandardMaterial({ color: dark, roughness: 0.9 });
  const skin = new THREE.MeshStandardMaterial({ color: PALETTE.skin, roughness: 0.8 });

  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.78, 0.3), clothDark);
  legs.position.y = 0.39;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.34), cloth);
  torso.position.y = 1.14;
  torso.userData.part = 'body';
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.36, 0.34), skin);
  head.position.y = 1.68;
  head.userData.part = 'head';
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.1, 0.4), clothDark);
  cap.position.y = 1.9;
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.14, 0.72), new THREE.MeshStandardMaterial({ color: PALETTE.metalDark, roughness: 0.5 }));
  gun.position.set(0.22, 1.28, -0.42);
  for (const m of [legs, torso, head, cap, gun]) { m.castShadow = true; group.add(m); }
  return { group, torso, head };
}

export function createBots(scene, colliders, rng) {
  const bots = [];

  function spawn(team, index, at) {
    const fig = buildFigure(team);
    fig.group.position.set(at.x, 0, at.z);
    scene.add(fig.group);
    const bot = {
      team, name: NAMES[team][index % NAMES[team].length],
      hp: 100, alive: true,
      pos: { x: at.x, z: at.z },
      yaw: team === 'ally' ? 0 : Math.PI,
      wpIndex: index * 3 % WAYPOINTS.length,
      mode: 'patrol',
      fireAt: 0, burstLeft: 0, nextThink: rng() * 0.3,
      strafeDir: rng() > 0.5 ? 1 : -1, strafeFlipAt: 0,
      blindUntil: 0, staggerUntil: 0,
      alertPos: null, alertUntil: 0, alertKind: null,
      holdPoint: null, defusing: 0,
      meshes: fig, group: fig.group,
    };
    fig.torso.userData.bot = bot;
    fig.head.userData.bot = bot;
    bots.push(bot);
    return bot;
  }

  function reset(spawns) {
    // Remove any previous round's figures before rebuilding the roster.
    for (const b of bots) scene.remove(b.group);
    bots.length = 0;
    spawns.ally.forEach((at, i) => { if (i > 0) spawn('ally', i - 1, at); });
    spawns.enemy.forEach((at, i) => spawn('enemy', i, at));
  }

  function foesOf(bot, playerState) {
    const list = [];
    if (bot.team === 'enemy' && playerState.alive) {
      list.push({ isPlayer: true, pos: playerState.position, hp: playerState.hp, alive: true, eye: playerState.eye });
    }
    for (const other of bots) {
      if (other.team !== bot.team && other.alive) {
        list.push({ isPlayer: false, bot: other, pos: other.pos, hp: other.hp, alive: true, eye: EYE });
      }
    }
    return list;
  }

  // Move toward a point, sliding along colliders; returns distance left.
  function moveToward(bot, tx, tz, dt, speedMul = 1) {
    const dx = tx - bot.pos.x, dz = tz - bot.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 0.05) {
      bot.yaw = Math.atan2(-dx, -dz);
      const stepLen = Math.min(dist, BOT_SPEED * speedMul * dt);
      bot.pos.x += (dx / dist) * stepLen;
      bot.pos.z += (dz / dist) * stepLen;
      collide(colliders, bot.pos, 0.55);
    }
    return dist;
  }

  // --- Senses beyond sight -------------------------------------------
  // Hearing: a shot fired within HEARING_RADIUS alerts every opposing
  // bot to investigate the shooter's position. Sound needs no line of
  // sight — that is what makes firing from cover a tactical cost.
  function senseHearing(bot, shotPos, now) {
    const d = Math.hypot(shotPos.x - bot.pos.x, shotPos.z - bot.pos.z);
    if (d > HEARING_RADIUS) return;
    bot.alertPos = { x: shotPos.x, z: shotPos.z };
    bot.alertUntil = now + ALERT_MEMORY;
    bot.alertKind = 'sound';
  }

  // Witness: a bot that can see a teammate die (or see the killer's
  // position from where the teammate fell) becomes alerted and checks
  // the killer's direction instead of walking its patrol loop blind.
  function senseWitnessDeath(bot, deadBot, killerPos, now) {
    const dDead = Math.hypot(deadBot.pos.x - bot.pos.x, deadBot.pos.z - bot.pos.z);
    if (dDead > WITNESS_RADIUS) return;
    const seesDeath = lineOfSight(colliders, bot.pos.x, bot.pos.z, deadBot.pos.x, deadBot.pos.z);
    const seesKiller = killerPos && lineOfSight(colliders, bot.pos.x, bot.pos.z, killerPos.x, killerPos.z);
    if (!seesDeath && !seesKiller) return;
    const toward = killerPos || deadBot.pos;
    bot.alertPos = { x: toward.x, z: toward.z };
    bot.alertUntil = now + ALERT_MEMORY + 1.5;
    bot.alertKind = 'witness';
  }

  // Called by main.js whenever any gun is fired (player or bot).
  function notifyShot(shooterPos, shooterTeam, now) {
    for (const bot of bots) {
      if (!bot.alive || bot.team === shooterTeam) continue;
      senseHearing(bot, shooterPos, now);
    }
  }

  // Called by main.js whenever a bot dies; killerPos may be a plain
  // {x, z} (player or bot position at the moment of the kill).
  function notifyDeath(deadBot, killerPos, now) {
    for (const bot of bots) {
      if (!bot.alive || bot === deadBot || bot.team !== deadBot.team) continue;
      senseWitnessDeath(bot, deadBot, killerPos, now);
    }
  }

  // One simulation tick. `ctx` carries the round state bots react to and the
  // callbacks that apply damage and play distant gunfire.
  function step(dt, now, ctx) {
    for (const bot of bots) {
      if (!bot.alive) continue;
      bot.group.position.set(bot.pos.x, 0, bot.pos.z);
      bot.group.rotation.y = bot.yaw;

      const blinded = now < bot.blindUntil;
      const staggered = now < bot.staggerUntil;

      // Perception: nearest visible foe.
      let target = null, targetDist = Infinity;
      if (!blinded && !staggered) {
        for (const foe of foesOf(bot, ctx.playerState)) {
          const d = Math.hypot(foe.pos.x - bot.pos.x, foe.pos.z - bot.pos.z);
          if (d < SIGHT_RANGE && d < targetDist && lineOfSight(colliders, bot.pos.x, bot.pos.z, foe.pos.x, foe.pos.z)) {
            target = foe; targetDist = d;
          }
        }
      }

      if (target) {
        bot.mode = 'engage';
        bot.lastSeen = { x: target.pos.x, z: target.pos.z };
        const dx = target.pos.x - bot.pos.x, dz = target.pos.z - bot.pos.z;
        bot.yaw = Math.atan2(-dx, -dz);
        // Keep a fighting distance and shuffle sideways between bursts.
        if (now > bot.strafeFlipAt) { bot.strafeDir *= -1; bot.strafeFlipAt = now + 0.7 + ctx.rng() * 0.9; }
        if (targetDist > 16) moveToward(bot, target.pos.x, target.pos.z, dt, 0.9);
        else if (targetDist < 6) moveToward(bot, bot.pos.x - dx, bot.pos.z - dz, dt, 0.6);
        else {
          bot.pos.x += Math.cos(bot.yaw) * bot.strafeDir * 1.1 * dt;
          bot.pos.z += -Math.sin(bot.yaw) * bot.strafeDir * 1.1 * dt;
          collide(colliders, bot.pos, 0.55);
        }
        // Burst fire with a human-ish pause between bursts. Tuning pass:
        // the pause now shrinks at close range, so a bot you rush is more
        // dangerous than one plinking across the tanker lane.
        if (now >= bot.fireAt) {
          if (bot.burstLeft <= 0) { bot.burstLeft = 3 + Math.floor(ctx.rng() * 3); bot.fireAt = now + 0.22 + ctx.rng() * 0.38 + targetDist * 0.005; }
          else {
            bot.burstLeft -= 1;
            bot.fireAt = now + 0.13;
            ctx.onBotShoot(bot, target, targetDist);
          }
        }
        continue;
      }

      // Objective behaviour when nobody is in sight.
      if (ctx.planted && bot.team === 'enemy') {
        const d = moveToward(bot, PLANT_ZONE.x, PLANT_ZONE.z, dt, 1.05);
        if (d < 2.4) { bot.defusing += dt; ctx.onDefuseProgress(bot, bot.defusing); if (bot.defusing >= 3.2) ctx.onDefused(bot); }
        else bot.defusing = 0;
        continue;
      }
      // Investigate: no visible foe, but a sense alert (gunfire heard or
      // a teammate seen falling) pulls the bot off its loop to check the
      // spot. Arriving bots scan the area briefly, then the alert fades.
      if (!blinded && !staggered && bot.alertPos && now < bot.alertUntil) {
        bot.mode = 'investigate';
        const d = moveToward(bot, bot.alertPos.x, bot.alertPos.z, dt, 1.0);
        if (d < 1.6) {
          bot.yaw += Math.sin(now * 1.7 + bot.wpIndex * 2.1) * 1.9 * dt;
          bot.alertUntil = Math.min(bot.alertUntil, now + 1.1);
        }
        continue;
      }
      if (bot.team === 'enemy' && bot.holdPoint) {
        bot.mode = 'hold';
        const d = moveToward(bot, bot.holdPoint.x, bot.holdPoint.z, dt, 0.95);
        if (d < 1.2) bot.yaw += Math.sin(now * 0.4 + bot.wpIndex) * 0.15 * dt * 4;
        continue;
      }
      bot.mode = 'patrol';
      const wp = WAYPOINTS[bot.wpIndex % WAYPOINTS.length];
      // Allies push north toward the plant yard; enemies walk their loop.
      const goal = bot.team === 'ally' && !ctx.planted
        ? WAYPOINTS[(bot.wpIndex + 8) % WAYPOINTS.length]
        : wp;
      if (moveToward(bot, goal.x, goal.z, dt, 0.85) < 1.4) bot.wpIndex += bot.team === 'ally' ? 2 : 3;
    }
  }

  function damage(bot, amount) {
    if (!bot.alive) return false;
    bot.hp -= amount;
    if (bot.hp <= 0) {
      bot.alive = false;
      bot.group.rotation.z = Math.PI / 2;
      bot.group.position.y = 0.25;
      return true;
    }
    return false;
  }

  function aliveCount(team) {
    return bots.filter((b) => b.team === team && b.alive).length;
  }

  function hitMeshes() {
    const out = [];
    for (const b of bots) { out.push(b.meshes.torso, b.meshes.head); }
    return out;
  }

  return { bots, reset, step, damage, aliveCount, hitMeshes, notifyShot, notifyDeath };
}
