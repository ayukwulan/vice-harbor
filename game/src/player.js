// VICE HARBOR — on-foot player: third-person character, walk/run, punch.
// The player is "Rex Marlowe", a driver fresh out of the harbor lockup.
import * as THREE from 'three';
import { PLAYER } from './config.js';
import { clamp } from './random.js';
import { resolveCollisions } from './city.js';

const SKIN = 0xc98d64;
const SHIRT = 0x2e6fc2;
const PANTS = 0x2b2f36;
const HAIR = 0x1a1210;

export function createPlayer(scene) {
  const group = new THREE.Group();
  group.name = 'player';
  const mats = {
    skin: new THREE.MeshLambertMaterial({ color: SKIN }),
    shirt: new THREE.MeshLambertMaterial({ color: SHIRT }),
    pants: new THREE.MeshLambertMaterial({ color: PANTS }),
    hair: new THREE.MeshLambertMaterial({ color: HAIR }),
    shoe: new THREE.MeshLambertMaterial({ color: 0x111111 }),
  };
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.85, 0.4), mats.shirt);
  torso.position.y = 1.15;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), mats.skin);
  head.position.y = 1.82;
  group.add(head);
  const hair = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.16, 0.46), mats.hair);
  hair.position.y = 2.06;
  group.add(hair);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.8, 0.2), mats.shirt);
  armL.position.set(-0.48, 1.15, 0);
  group.add(armL);
  const armR = armL.clone();
  armR.position.x = 0.48;
  group.add(armR);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.75, 0.26), mats.pants);
  legL.position.set(-0.18, 0.38, 0);
  group.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.18;
  group.add(legR);
  scene.add(group);

  const state = {
    group, armL, armR, legL, legR,
    x: 0, z: 30, heading: 0, // heading: radians, 0 = facing +z
    speed: 0,
    walkPhase: 0,
    punchTimer: 0,
    punchCooldown: 0,
    moving: false,
  };

  function update(dt, input, camYaw, colliders) {
    const fwdX = Math.sin(camYaw);
    const fwdZ = Math.cos(camYaw);
    const rightX = Math.cos(camYaw);
    const rightZ = -Math.sin(camYaw);
    let mx = 0;
    let mz = 0;
    if (input.forward) { mx += fwdX; mz += fwdZ; }
    if (input.back) { mx -= fwdX; mz -= fwdZ; }
    if (input.left) { mx -= rightX; mz -= rightZ; }
    if (input.right) { mx += rightX; mz += rightZ; }
    const len = Math.hypot(mx, mz);
    state.moving = len > 0.01;
    const targetSpeed = state.moving
      ? (input.run ? PLAYER.runSpeed : PLAYER.walkSpeed)
      : 0;
    state.speed = clamp(state.speed + (targetSpeed - state.speed) * Math.min(1, dt * 8), 0, PLAYER.runSpeed);
    if (state.moving && len > 0.01) {
      const nx = mx / len;
      const nz = mz / len;
      state.x += nx * state.speed * dt;
      state.z += nz * state.speed * dt;
      const targetHeading = Math.atan2(nx, nz);
      let d = targetHeading - state.heading;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      state.heading += clamp(d, -dt * 10, dt * 10);
      state.walkPhase += dt * state.speed * 1.6;
    }
    const [rx, rz] = resolveCollisions(state.x, state.z, PLAYER.radius, colliders);
    state.x = rx;
    state.z = rz;
    const lim = 300;
    state.x = clamp(state.x, -lim, lim);
    state.z = clamp(state.z, -lim, lim);
    state.punchTimer = Math.max(0, state.punchTimer - dt);
    state.punchCooldown = Math.max(0, state.punchCooldown - dt);

    // Pose.
    group.position.set(state.x, 0, state.z);
    group.rotation.y = state.heading;
    const swing = state.moving ? Math.sin(state.walkPhase) * 0.7 : 0;
    state.legL.rotation.x = swing;
    state.legR.rotation.x = -swing;
    if (state.punchTimer > 0) {
      state.armR.rotation.x = -1.9 * (state.punchTimer / 0.25);
    } else {
      state.armR.rotation.x = -swing * 0.6;
      state.armL.rotation.x = swing * 0.6;
    }
    return state;
  }

  function punch() {
    if (state.punchCooldown > 0) return false;
    state.punchTimer = 0.25;
    state.punchCooldown = 0.45;
    return true;
  }

  function setPosition(x, z, heading = 0) {
    state.x = x;
    state.z = z;
    state.heading = heading;
    group.position.set(x, 0, z);
    group.rotation.y = heading;
  }

  return { state, update, punch, setPosition, group };
}
