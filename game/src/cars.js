// VICE HARBOR — cars: mesh factory, arcade driving physics, traffic AI.
// Traffic cars drive the road grid; the player can steal and drive any of them.
import * as THREE from 'three';
import { CAR_PHYSICS, PALETTE } from './config.js';
import { clamp, makeRng } from './random.js';
import { isOnRoad, nearestRoadCoord, resolveCollisions } from './city.js';

const ROAD_COORDS = [];
for (let i = 0; i <= 9; i++) ROAD_COORDS.push(-270 + i * 60);

// Display names for the cars on the street, keyed by their real colour.
// A name is only a label for a car that exists; police and taxis get theirs
// from their kind instead.
const CAR_NAMES = new Map([
  [0xc22e2e, 'Crimson GT'],
  [0x2e6fc2, 'Marina Blue'],
  [0xe8c832, 'Gold Rush'],
  [0x2ec27a, 'Palm Green'],
  [0xe8e8e8, 'Pearl White'],
  [0x222222, 'Midnight'],
  [0x7a4dc2, 'Violet Storm'],
  [0xe87a2e, 'Ember GT'],
]);

export function carName(car) {
  if (!car) return '';
  if (car.kind === 'police') return 'Harbor Interceptor';
  if (car.kind === 'taxi') return 'City Cab';
  return CAR_NAMES.get(car.color) ?? 'Street Sedan';
}

export function buildCarMesh(color, kind = 'sedan') {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x18222e });
  const tireMat = new THREE.MeshLambertMaterial({ color: 0x0c0c0c });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.62, 4.4), bodyMat);
  body.position.y = 0.55;
  group.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 2.2), glassMat);
  cabin.position.set(0, 1.08, -0.2);
  group.add(cabin);
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 10);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheels = [];
  for (const [wx, wz] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const wheel = new THREE.Mesh(wheelGeo, tireMat);
    wheel.position.set(wx, 0.36, wz);
    group.add(wheel);
    wheels.push(wheel);
  }
  // headlights + taillights
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2a2a });
  for (const hx of [-0.65, 0.65]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.14, 0.08), headMat);
    h.position.set(hx, 0.62, 2.22);
    group.add(h);
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.14, 0.08), tailMat);
    t.position.set(hx, 0.62, -2.22);
    group.add(t);
  }
  if (kind === 'police') {
    const barMat = new THREE.MeshBasicMaterial({ color: 0xff2222 });
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.24, 0.4), barMat);
    bar.position.set(0, 1.46, -0.2);
    bar.name = 'lightbar';
    group.add(bar);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.2, 4.42),
      new THREE.MeshLambertMaterial({ color: 0xf0f0f0 }));
    stripe.position.y = 0.72;
    group.add(stripe);
  }
  if (kind === 'taxi') {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 0.4),
      new THREE.MeshBasicMaterial({ color: 0xffe14d }));
    sign.position.set(0, 1.5, -0.2);
    group.add(sign);
  }
  return { group, wheels };
}

export function createCar(scene, x, z, heading, color, kind = 'sedan') {
  const { group, wheels } = buildCarMesh(color, kind);
  group.position.set(x, 0, z);
  group.rotation.y = heading;
  scene.add(group);
  return {
    group, wheels, kind, color,
    x, z, heading,
    speed: 0,
    steering: 0,
    occupied: false,
    // Condition wears down only on real building scrapes (see driveCar).
    condition: 100,
    // traffic AI fields
    ai: null,
    wheelSpin: 0,
  };
}

// Arcade driving: forward accel, brake/reverse, steering scales with speed.
export function driveCar(car, input, dt, colliders) {
  const maxFwd = CAR_PHYSICS.maxSpeed;
  if (input.forward) car.speed += CAR_PHYSICS.accel * dt;
  if (input.back) {
    car.speed -= (car.speed > 0.5 ? CAR_PHYSICS.brake : CAR_PHYSICS.accel * 0.6) * dt;
  }
  if (!input.forward && !input.back) {
    car.speed -= Math.sign(car.speed) * CAR_PHYSICS.drag * 6 * dt;
    if (Math.abs(car.speed) < 0.4) car.speed = 0;
  }
  car.speed = clamp(car.speed, -CAR_PHYSICS.reverseMax, maxFwd);
  const steerTarget = (input.left ? 1 : 0) - (input.right ? 1 : 0);
  car.steering += (steerTarget - car.steering) * Math.min(1, dt * 6);
  const dir = car.speed >= 0 ? 1 : -1;
  car.heading += car.steering * CAR_PHYSICS.turnRate * dt * clamp(Math.abs(car.speed) / 8, 0, 1) * dir;
  const nx = car.x + Math.sin(car.heading) * car.speed * dt;
  const nz = car.z + Math.cos(car.heading) * car.speed * dt;
  const [rx, rz] = resolveCollisions(nx, nz, 1.9, colliders);
  if (rx !== nx || rz !== nz) {
    car.speed *= 0.4; // scrape a building: lose speed and wear the car down
    car.condition = Math.max(0, Math.round(car.condition) - 2);
  }
  car.x = clamp(rx, -300, 300);
  car.z = clamp(rz, -300, 300);
  car.group.position.set(car.x, 0, car.z);
  car.group.rotation.y = car.heading;
  car.wheelSpin += car.speed * dt * 2.2;
  for (const w of car.wheels) w.rotation.x = car.wheelSpin;
  return car;
}

// --- Traffic AI -------------------------------------------------------------
export function spawnTraffic(scene, count, rng) {
  const cars = [];
  for (let i = 0; i < count; i++) {
    const horizontal = rng.chance(0.5);
    const road = ROAD_COORDS[rng.int(0, ROAD_COORDS.length - 1)];
    const along = rng.range(-260, 260);
    const lane = rng.chance(0.5) ? 3.2 : -3.2;
    const dir = rng.chance(0.5) ? 1 : -1;
    const x = horizontal ? along : road + lane;
    const z = horizontal ? road + lane : along;
    const heading = horizontal ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI);
    const kind = rng.chance(0.12) ? 'taxi' : 'sedan';
    const color = kind === 'taxi' ? PALETTE.taxi : PALETTE.car[rng.int(0, PALETTE.car.length - 1)];
    const car = createCar(scene, x, z, heading, color, kind);
    car.ai = {
      horizontal, road, dir,
      // Round-2 polish: traffic cruises a touch faster so the roads feel alive.
      speed: rng.range(8, 14),
      lane,
      turnCooldown: rng.range(2, 8),
    };
    cars.push(car);
  }
  return cars;
}

export function updateTraffic(cars, dt, rng) {
  for (const car of cars) {
    if (car.occupied || !car.ai) continue;
    const ai = car.ai;
    ai.turnCooldown -= dt;
    // At an intersection, sometimes turn onto the cross road.
    const onXRoad = ROAD_COORDS.some((r) => Math.abs(car.x - r) < 4);
    const onZRoad = ROAD_COORDS.some((r) => Math.abs(car.z - r) < 4);
    // Round-3 polish: traffic turns at intersections slightly less often, steadier flow.
    if (ai.turnCooldown <= 0 && onXRoad && onZRoad && rng.chance(0.30)) {
      ai.horizontal = !ai.horizontal;
      ai.road = ai.horizontal ? nearestRoadCoord(car.z) : nearestRoadCoord(car.x);
      ai.dir = rng.chance(0.5) ? 1 : -1;
      ai.lane = rng.chance(0.5) ? 3.2 : -3.2;
      ai.turnCooldown = rng.range(4, 10);
    }
    if (ai.horizontal) {
      car.heading = ai.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      car.x += ai.dir * ai.speed * dt;
      car.z += (ai.road + ai.lane - car.z) * Math.min(1, dt * 2);
      if (car.x > 275) car.x = -275;
      if (car.x < -275) car.x = 275;
    } else {
      car.heading = ai.dir > 0 ? 0 : Math.PI;
      car.z += ai.dir * ai.speed * dt;
      car.x += (ai.road + ai.lane - car.x) * Math.min(1, dt * 2);
      if (car.z > 275) car.z = -275;
      if (car.z < -275) car.z = 275;
    }
    car.group.position.set(car.x, 0, car.z);
    car.group.rotation.y = car.heading;
    car.wheelSpin += ai.speed * dt * 2.2;
    for (const w of car.wheels) w.rotation.x = car.wheelSpin;
  }
}

export function nearestCar(cars, x, z, maxDist) {
  let best = null;
  let bd = maxDist;
  for (const car of cars) {
    const d = Math.hypot(car.x - x, car.z - z);
    if (d < bd) {
      bd = d;
      best = car;
    }
  }
  return best;
}

export function roadPosition(rng) {
  const horizontal = rng.chance(0.5);
  const road = ROAD_COORDS[rng.int(0, ROAD_COORDS.length - 1)];
  const along = rng.range(-240, 240);
  return horizontal ? { x: along, z: road } : { x: road, z: along };
}

export { isOnRoad };
