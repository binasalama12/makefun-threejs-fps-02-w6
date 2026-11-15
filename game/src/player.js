// First-person body: acceleration-based movement with crouch, sprint and a
// small jump. Speed feeds the weapon spread model, so a player who stops
// and crouches shoots noticeably tighter than one who runs.
import { collide } from './world.js';

const WALK = 4.6;
const SPRINT = 6.4;
const CROUCH_SPEED = 2.3;
const ACCEL = 34;
const RADIUS = 0.55;

export function createPlayer(colliders, spawn) {
  const state = {
    position: { x: spawn.x, z: spawn.z },
    vel: { x: 0, z: 0 },
    y: 0, vy: 0,
    yaw: 0, // face north (-Z), toward the station and the tower
    pitch: 0,
    hp: 100,
    crouching: false,
    grounded: true,
    alive: true,
    get eye() { return (this.crouching ? 1.12 : 1.62) + this.y; },
  };

  function look(dx, dy) {
    state.yaw -= dx * 0.0021;
    state.pitch -= dy * 0.0021;
    state.pitch = Math.max(-1.35, Math.min(1.35, state.pitch));
  }

  function recoil(up, side) {
    state.pitch += up;
    state.yaw += side;
  }

  function speed() {
    return Math.hypot(state.vel.x, state.vel.z);
  }

  function step(dt, keys, frozen) {
    state.crouching = keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC');
    let ix = 0, iz = 0;
    if (!frozen && state.alive) {
      if (keys.has('KeyW') || keys.has('ArrowUp')) iz -= 1;
      if (keys.has('KeyS') || keys.has('ArrowDown')) iz += 1;
      if (keys.has('KeyA') || keys.has('ArrowLeft')) ix -= 1;
      if (keys.has('KeyD') || keys.has('ArrowRight')) ix += 1;
    }
    const len = Math.hypot(ix, iz) || 1;
    ix /= len; iz /= len;
    const sprinting = (keys.has('ShiftLeft') || keys.has('ShiftRight')) && !state.crouching;
    const target = state.crouching ? CROUCH_SPEED : (sprinting ? SPRINT : WALK);
    // Camera convention: forward is (-sin yaw, -cos yaw), right is
    // (cos yaw, -sin yaw). Input iz is -1 for forward, ix is +1 for right.
    const sin = Math.sin(state.yaw), cos = Math.cos(state.yaw);
    const wx = (ix * cos + iz * sin) * target;
    const wz = (-ix * sin + iz * cos) * target;
    const blend = Math.min(1, ACCEL * dt / Math.max(target, 1));
    state.vel.x += (wx - state.vel.x) * blend;
    state.vel.z += (wz - state.vel.z) * blend;
    if (!keys.size && Math.hypot(state.vel.x, state.vel.z) < 0.05) { state.vel.x = 0; state.vel.z = 0; }
    state.position.x += state.vel.x * dt;
    state.position.z += state.vel.z * dt;
    collide(colliders, state.position, RADIUS);

    if (!frozen && state.alive && state.grounded && keys.has('Space') && !state.crouching) {
      state.vy = 4.6;
      state.grounded = false;
    }
    if (!state.grounded) {
      state.vy -= 13.5 * dt;
      state.y += state.vy * dt;
      if (state.y <= 0) { state.y = 0; state.vy = 0; state.grounded = true; }
    }
  }

  function respawn(at) {
    state.position.x = at.x; state.position.z = at.z;
    state.vel.x = 0; state.vel.z = 0;
    state.y = 0; state.vy = 0;
    state.hp = 100; state.alive = true;
    state.yaw = 0; state.pitch = 0;
  }

  return { state, look, recoil, speed, step, respawn };
}
