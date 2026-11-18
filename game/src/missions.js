// VICE HARBOR — missions in 3D: waypoint beacons, gang enemies, objective flow.
// The state machine itself lives in logic.js; this file renders and spawns it.
import * as THREE from 'three';
import { MISSIONS } from './config.js';
import { makeRng } from './random.js';

const GANG_COLORS = { shirt: 0x1a1a1a, pants: 0x222222, skin: 0xc98d64, bandana: 0xc22e2e };

function buildGangMesh(boss) {
  const group = new THREE.Group();
  const scale = boss ? 1.18 : 1;
  const m = (c) => new THREE.MeshLambertMaterial({ color: c });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.85, 0.42), m(GANG_COLORS.shirt));
  torso.position.y = 1.15 * scale;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), m(GANG_COLORS.skin));
  head.position.y = 1.82 * scale;
  group.add(head);
  const band = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.14, 0.46), m(GANG_COLORS.bandana));
  band.position.y = 1.98 * scale;
  group.add(band);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.8, 0.2), m(GANG_COLORS.shirt));
  armL.position.set(-0.48 * scale, 1.15 * scale, 0);
  group.add(armL);
  const armR = armL.clone();
  armR.position.x = 0.48 * scale;
  group.add(armR);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.75, 0.26), m(GANG_COLORS.pants));
  legL.position.set(-0.18 * scale, 0.38 * scale, 0);
  group.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.18 * scale;
  group.add(legR);
  // boss gets a gold chain
  if (boss) {
    const chain = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.44), m(0xffd24d));
    chain.position.y = 1.45 * scale;
    group.add(chain);
  }
  group.scale.setScalar(scale);
  return { group, armL, armR, legL, legR };
}

export function createMissionLayer(scene, seed) {
  const rng = makeRng(seed + 77);
  // Waypoint beacon: a glowing column + floating diamond marker.
  const beaconMat = new THREE.MeshBasicMaterial({
    color: 0xffe14d, transparent: true, opacity: 0.28, side: THREE.DoubleSide,
  });
  const beacon = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 40, 16, 1, true), beaconMat);
  beacon.position.y = 20;
  beacon.visible = false;
  scene.add(beacon);
  const markerGeo = new THREE.OctahedronGeometry(1.4);
  const markerMat = new THREE.MeshBasicMaterial({ color: 0xffe14d });
  const marker = new THREE.Mesh(markerGeo, markerMat);
  marker.visible = false;
  scene.add(marker);
  return {
    scene, rng, beacon, marker,
    enemies: [], // {group, x, z, heading, health, boss, shootTimer, phase, legL...}
    markerPulse: 0,
  };
}

export function setBeacon(layer, x, z, visible) {
  layer.beacon.visible = visible;
  layer.marker.visible = visible;
  if (!visible) return;
  layer.beacon.position.x = x;
  layer.beacon.position.z = z;
  layer.marker.position.set(x, 6, z);
}

export function spawnEnemies(layer, step, count) {
  clearEnemies(layer);
  for (let i = 0; i < count; i++) {
    const boss = !!step.boss && i === count - 1;
    const parts = buildGangMesh(boss);
    const a = (i / count) * Math.PI * 2 + layer.rng.range(-0.4, 0.4);
    const d = layer.rng.range(4, Math.max(6, (step.radius ?? 18) - 4));
    const x = step.x + Math.sin(a) * d;
    const z = step.z + Math.cos(a) * d;
    parts.group.position.set(x, 0, z);
    layer.scene.add(parts.group);
    layer.enemies.push({
      ...parts, x, z, heading: a, boss,
      health: boss ? 220 : 100,
      shootTimer: layer.rng.range(0.6, 2.2),
      phase: layer.rng.range(0, 6),
      state: 'alive',
    });
  }
}

export function clearEnemies(layer) {
  for (const e of layer.enemies) layer.scene.remove(e.group);
  layer.enemies = [];
}

export function updateEnemies(layer, dt, playerPos, onShootPlayer) {
  let anyAlive = false;
  for (const e of layer.enemies) {
    if (e.state !== 'alive') continue;
    anyAlive = true;
    const dx = playerPos.x - e.x;
    const dz = playerPos.z - e.z;
    const dist = Math.hypot(dx, dz) || 1;
    const want = Math.atan2(dx / dist, dz / dist);
    let diff = want - e.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    e.heading += Math.max(-dt * 3, Math.min(dt * 3, diff));
    // Close in to shooting range, then stand and fire.
    if (dist > 16) {
      e.x += Math.sin(e.heading) * 4.2 * dt;
      e.z += Math.cos(e.heading) * 4.2 * dt;
      e.phase += dt * 7;
    } else {
      e.shootTimer -= dt;
      if (e.shootTimer <= 0) {
        e.shootTimer = e.boss ? 1.1 : 1.9;
        onShootPlayer(e.boss ? 12 : 7);
      }
    }
    const swing = Math.sin(e.phase) * 0.5;
    e.legL.rotation.x = swing;
    e.legR.rotation.x = -swing;
    e.group.position.set(e.x, 0, e.z);
    e.group.rotation.y = e.heading;
  }
  return anyAlive;
}

export function updateBeaconPulse(layer, dt) {
  layer.markerPulse += dt;
  if (layer.marker.visible) {
    layer.marker.rotation.y += dt * 1.5;
    layer.marker.position.y = 6 + Math.sin(layer.markerPulse * 2) * 0.8;
  }
}

export function missionById(id) {
  return MISSIONS.find((m) => m.id === id) ?? null;
}
