// VICE HARBOR — pedestrians: sidewalk walkers who stroll, flee and react.
import * as THREE from 'three';
import { makeRng } from './random.js';
import { clamp } from './random.js';

const SHIRTS = [0xd8d8d8, 0xc25a5a, 0x5a8ac2, 0x7ac25a, 0xc2a45a, 0x9a5ac2, 0x5ac2b8];
const PANTS = [0x2b2f36, 0x3a3f46, 0x4a3a2a, 0x222831];

function buildPedMesh(shirt, pants, skin) {
  const group = new THREE.Group();
  const m = (c) => new THREE.MeshLambertMaterial({ color: c });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.8, 0.36), m(shirt));
  torso.position.y = 1.1;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.38, 0.38), m(skin));
  head.position.y = 1.72;
  group.add(head);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.72, 0.22), m(pants));
  legL.position.set(-0.15, 0.36, 0);
  group.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.15;
  group.add(legR);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.7, 0.16), m(shirt));
  armL.position.set(-0.4, 1.1, 0);
  group.add(armL);
  const armR = armL.clone();
  armR.position.x = 0.4;
  group.add(armR);
  return { group, legL, legR, armL, armR };
}

export function spawnPedestrians(scene, count, rng) {
  const peds = [];
  for (let i = 0; i < count; i++) {
    const shirt = SHIRTS[rng.int(0, SHIRTS.length - 1)];
    const pants = PANTS[rng.int(0, PANTS.length - 1)];
    const skin = [0xc98d64, 0x8a5a3a, 0xe8b88a, 0x6b4230][rng.int(0, 3)];
    const parts = buildPedMesh(shirt, pants, skin);
    const x = rng.range(-260, 260);
    const z = rng.range(-260, 260);
    parts.group.position.set(x, 0, z);
    scene.add(parts.group);
    peds.push({
      ...parts,
      x, z,
      heading: rng.range(0, Math.PI * 2),
      speed: rng.range(1.2, 2.4),
      phase: rng.range(0, Math.PI * 2),
      targetX: x, targetZ: z,
      retargetIn: rng.range(1, 6),
      fleeing: false,
      state: 'walk', // walk | flee | down
      health: 100,
    });
  }
  return peds;
}

export function updatePedestrians(peds, dt, rng, threat) {
  for (const p of peds) {
    if (p.state === 'down') continue;
    p.retargetIn -= dt;
    const threatNear = threat && Math.hypot(threat.x - p.x, threat.z - p.z) < 14;
    if (threatNear && p.state !== 'flee') {
      p.state = 'flee';
      p.fleeing = true;
    } else if (!threatNear && p.state === 'flee') {
      p.state = 'walk';
      p.fleeing = false;
    }
    if (p.state === 'flee') {
      const dx = p.x - threat.x;
      const dz = p.z - threat.z;
      const d = Math.hypot(dx, dz) || 1;
      p.heading = Math.atan2(dx / d, dz / d);
      p.x += (dx / d) * 5.5 * dt;
      p.z += (dz / d) * 5.5 * dt;
      p.speed = 5.5;
    } else {
      if (p.retargetIn <= 0) {
        p.targetX = clamp(p.x + rng.range(-40, 40), -265, 265);
        p.targetZ = clamp(p.z + rng.range(-40, 40), -265, 265);
        p.retargetIn = rng.range(3, 9);
      }
      const dx = p.targetX - p.x;
      const dz = p.targetZ - p.z;
      const d = Math.hypot(dx, dz);
      if (d > 1) {
        const want = Math.atan2(dx / d, dz / d);
        let diff = want - p.heading;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        p.heading += clamp(diff, -dt * 4, dt * 4);
        p.x += Math.sin(p.heading) * p.speed * dt;
        p.z += Math.cos(p.heading) * p.speed * dt;
      }
    }
    p.phase += dt * p.speed * 3.2;
    const swing = Math.sin(p.phase) * 0.55;
    p.legL.rotation.x = swing;
    p.legR.rotation.x = -swing;
    p.armL.rotation.x = -swing * 0.7;
    p.armR.rotation.x = swing * 0.7;
    p.group.position.set(p.x, 0, p.z);
    p.group.rotation.y = p.heading;
  }
}

export function nearestPed(peds, x, z, maxDist) {
  let best = null;
  let bd = maxDist;
  for (const p of peds) {
    if (p.state === 'down') continue;
    const d = Math.hypot(p.x - x, p.z - z);
    if (d < bd) {
      bd = d;
      best = p;
    }
  }
  return best;
}
