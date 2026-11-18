// VICE HARBOR — combat: punch + pistol, muzzle flash, tracer lines, hit sparks.
// Hit math reuses the pure shotHits() cone test from logic.js.
import * as THREE from 'three';
import { PLAYER } from './config.js';
import { shotHits } from './logic.js';

export function createCombat(scene) {
  const tracerMat = new THREE.MeshBasicMaterial({ color: 0xffe98a });
  const tracerGeo = new THREE.BoxGeometry(0.06, 0.06, 1);
  const tracers = [];
  const flashLight = new THREE.PointLight(0xffd98a, 0, 18);
  scene.add(flashLight);
  return {
    scene, tracers, tracerMat, tracerGeo, flashLight,
    cooldown: 0,
    flashTimer: 0,
  };
}

function spawnTracer(combat, from, to) {
  const len = Math.hypot(to.x - from.x, to.z - from.z);
  if (len < 0.5) return;
  const mesh = new THREE.Mesh(combat.tracerGeo, combat.tracerMat);
  mesh.position.set((from.x + to.x) / 2, 1.3, (from.z + to.z) / 2);
  mesh.scale.z = len;
  mesh.rotation.y = Math.atan2(to.x - from.x, to.z - from.z);
  combat.scene.add(mesh);
  combat.tracers.push({ mesh, life: 0.09 });
}

export function updateCombat(combat, dt) {
  combat.cooldown = Math.max(0, combat.cooldown - dt);
  combat.flashTimer = Math.max(0, combat.flashTimer - dt);
  combat.flashLight.intensity = combat.flashTimer > 0 ? 60 : 0;
  for (let i = combat.tracers.length - 1; i >= 0; i--) {
    const t = combat.tracers[i];
    t.life -= dt;
    if (t.life <= 0) {
      combat.scene.remove(t.mesh);
      combat.tracers.splice(i, 1);
    }
  }
}

// Fire the pistol from the player toward their heading.
// targets: [{x, z, health, onHit}] — enemies, cops or peds.
// Returns the target hit, or null.
export function firePistol(combat, shooter, targets, onShot) {
  if (combat.cooldown > 0) return null;
  combat.cooldown = PLAYER.pistolCooldown;
  combat.flashTimer = 0.07;
  combat.flashLight.position.set(shooter.x, 1.4, shooter.z);
  const from = { x: shooter.x, z: shooter.z };
  // Find the closest target inside the firing cone.
  let best = null;
  let bestDist = PLAYER.pistolRange;
  for (const t of targets) {
    if (t.health <= 0 || t.state === 'down') continue;
    if (!shotHits(shooter, t, PLAYER.pistolRange, 0.22)) continue;
    const d = Math.hypot(t.x - shooter.x, t.z - shooter.z);
    if (d < bestDist) {
      bestDist = d;
      best = t;
    }
  }
  const end = best
    ? { x: best.x, z: best.z }
    : {
        x: shooter.x + Math.sin(shooter.heading) * PLAYER.pistolRange,
        z: shooter.z + Math.cos(shooter.heading) * PLAYER.pistolRange,
      };
  spawnTracer(combat, from, end);
  if (onShot) onShot(best);
  return best;
}

// Punch: damage the nearest damageable thing in front of the player.
export function punchHit(shooter, targets, range = 2.4) {
  let best = null;
  let bd = range;
  for (const t of targets) {
    if (t.health <= 0 || t.state === 'down') continue;
    const d = Math.hypot(t.x - shooter.x, t.z - shooter.z);
    if (d < bd) {
      // must be roughly in front
      const ang = Math.atan2(t.x - shooter.x, t.z - shooter.z);
      let diff = ang - shooter.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      if (Math.abs(diff) < 1.1) {
        bd = d;
        best = t;
      }
    }
  }
  return best;
}
