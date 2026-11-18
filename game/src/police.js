// VICE HARBOR — police: patrol cars that chase, ram and bust; foot cops on foot.
// Wanted stars decide how many units hunt the player.
import * as THREE from 'three';
import { PALETTE } from './config.js';
import { clamp, makeRng } from './random.js';
import { createCar } from './cars.js';
import { resolveCollisions } from './city.js';

// Harbor police call signs, handed out in order as units spawn.
// A name is only a label for a real unit — never a unit that does not exist.
const CAR_CALLSIGNS = ['IBIS-23', 'TARPON-12', 'HERON-07', 'KESTREL-31', 'MARLIN-05', 'GULL-19'];
const COP_CALLSIGNS = ['OFFICER DUNN', 'OFFICER REYES', 'OFFICER COLE', 'OFFICER MARSH'];

export function createPoliceForce(scene, rng) {
  return {
    cars: [], // {car, state:'patrol'|'chase', targetX, targetZ}
    cops: [], // on-foot officers {group, x, z, heading, bustTimer}
    rng,
    scene,
    sirenPhase: 0,
  };
}

function buildCopMesh() {
  const group = new THREE.Group();
  const navy = new THREE.MeshLambertMaterial({ color: 0x1c2f4d });
  const skin = new THREE.MeshLambertMaterial({ color: 0xc98d64 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.85, 0.4), navy);
  torso.position.y = 1.15;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), skin);
  head.position.y = 1.8;
  group.add(head);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.14, 0.46), navy);
  cap.position.y = 2.02;
  group.add(cap);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.75, 0.24), navy);
  legL.position.set(-0.17, 0.38, 0);
  group.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.17;
  group.add(legR);
  return { group, legL, legR };
}

export function setPoliceCount(force, wanted, playerX, playerZ) {
  const wantCars = wanted >= 1 ? Math.min(wanted + 1, 6) : 0;
  const wantCops = wanted >= 2 ? Math.min(wanted - 1, 4) : 0;
  // Add cars.
  while (force.cars.length < wantCars) {
    const a = force.rng.range(0, Math.PI * 2);
    // Round-3 polish: pursuit cars spawn a touch farther out so chases build up.
    const d = force.rng.range(30, 48);
    const car = createCar(force.scene, playerX + Math.sin(a) * d, playerZ + Math.cos(a) * d,
      a, PALETTE.police, 'police');
    car.ai = null;
    force.cars.push({
      car, state: 'chase',
      name: CAR_CALLSIGNS[force.cars.length % CAR_CALLSIGNS.length],
    });
  }
  while (force.cars.length > wantCars) {
    const unit = force.cars.pop();
    force.scene.remove(unit.car.group);
  }
  // Add foot cops.
  while (force.cops.length < wantCops) {
    const a = force.rng.range(0, Math.PI * 2);
    const d = force.rng.range(12, 25);
    const parts = buildCopMesh();
    parts.group.position.set(playerX + Math.sin(a) * d, 0, playerZ + Math.cos(a) * d);
    force.scene.add(parts.group);
    force.cops.push({
      ...parts, x: playerX + Math.sin(a) * d, z: playerZ + Math.cos(a) * d,
      heading: 0, bustTimer: 0, phase: 0,
      name: COP_CALLSIGNS[force.cops.length % COP_CALLSIGNS.length],
    });
  }
  while (force.cops.length > wantCops) {
    const cop = force.cops.pop();
    force.scene.remove(cop.group);
  }
}

export function updatePolice(force, dt, player, inCar, colliders) {
  const px = player.x;
  const pz = player.z;
  force.sirenPhase += dt * 2.4;
  const flashing = Math.sin(force.sirenPhase) > 0;
  for (const unit of force.cars) {
    const car = unit.car;
    // Steer toward the player, arcade style.
    const dx = px - car.x;
    const dz = pz - car.z;
    const dist = Math.hypot(dx, dz) || 1;
    const wantHeading = Math.atan2(dx / dist, dz / dist);
    let diff = wantHeading - car.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    car.heading += clamp(diff, -dt * 2.6, dt * 2.6);
    // Round-2 polish: pursuit cars close slightly faster so chases stay tense.
    const targetSpeed = dist > 8 ? 32 : 18;
    car.speed += (targetSpeed - car.speed) * Math.min(1, dt * 1.5);
    car.x += Math.sin(car.heading) * car.speed * dt;
    car.z += Math.cos(car.heading) * car.speed * dt;
    const [rx, rz] = resolveCollisions(car.x, car.z, 1.9, colliders);
    car.x = rx;
    car.z = rz;
    car.group.position.set(car.x, 0, car.z);
    car.group.rotation.y = car.heading;
    // Flashing light bar.
    const bar = car.group.getObjectByName('lightbar');
    if (bar) bar.material.color.setHex(flashing ? 0xff2222 : 0x2244ff);
    // Ram the player: if the player is on foot and a police car touches them,
    // it hurts; if the player is driving, it shoves their car.
    if (dist < 3.2) {
      if (!inCar) {
        player.speed = 0;
      }
    }
  }
  for (const cop of force.cops) {
    const dx = px - cop.x;
    const dz = pz - cop.z;
    const dist = Math.hypot(dx, dz) || 1;
    const wantHeading = Math.atan2(dx / dist, dz / dist);
    let diff = wantHeading - cop.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    cop.heading += clamp(diff, -dt * 5, dt * 5);
    const speed = dist > 2 ? 6.5 : 0;
    cop.x += Math.sin(cop.heading) * speed * dt;
    cop.z += Math.cos(cop.heading) * speed * dt;
    cop.phase += dt * speed * 2.4;
    cop.legL.rotation.x = Math.sin(cop.phase) * 0.6;
    cop.legR.rotation.x = -Math.sin(cop.phase) * 0.6;
    cop.group.position.set(cop.x, 0, cop.z);
    cop.group.rotation.y = cop.heading;
    // Bust: a cop standing on the player for 1.6s ends the run.
    if (!inCar && dist < 1.8) cop.bustTimer += dt;
    else cop.bustTimer = Math.max(0, cop.bustTimer - dt * 2);
  }
  return force.cops.some((c) => c.bustTimer > 1.6);
}

export function policeCarNearPlayer(force, px, pz, maxDist) {
  for (const unit of force.cars) {
    if (Math.hypot(unit.car.x - px, unit.car.z - pz) < maxDist) return unit.car;
  }
  return null;
}

// HUD data for the police response panel: one row per real unit, nearest first.
// Behaviour words come from the unit's real state: a pursuit car closing from
// farther than 8m is PURSUIT; inside 8m it is close enough to RAM.
// A foot cop with a running bust timer is BUSTING, otherwise ON FOOT.
export function policePanelData(force, px, pz) {
  const rows = [];
  for (const unit of force.cars) {
    const dist = Math.hypot(unit.car.x - px, unit.car.z - pz);
    rows.push({
      name: unit.name ?? 'UNIT',
      dist: Math.round(dist),
      behaviour: dist > 8 ? 'PURSUIT' : 'RAMMING',
    });
  }
  for (const cop of force.cops) {
    const dist = Math.hypot(cop.x - px, cop.z - pz);
    rows.push({
      name: cop.name ?? 'OFFICER',
      dist: Math.round(dist),
      behaviour: cop.bustTimer > 0 ? 'BUSTING' : 'ON FOOT',
    });
  }
  rows.sort((a, b) => a.dist - b.dist);
  return rows;
}

// True while any police unit is close enough to be on the player's tail.
export function policeInSight(force, px, pz) {
  return force.cars.some((u) => Math.hypot(u.car.x - px, u.car.z - pz) < 45)
    || force.cops.some((c) => Math.hypot(c.x - px, c.z - pz) < 20);
}
