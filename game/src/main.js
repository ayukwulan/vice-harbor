// VICE HARBOR — an original open-world crime game.
// Rex Marlowe, driver fresh out of the harbor lockup, works for club owner
// Mara Voss and detective Rook to take down the Blackfin gang and its boss,
// Silas Crane. Steal cars, dodge the harbor police, run five story missions.
import * as THREE from 'three';
import { CITY, PALETTE, PLAYER, CAR_PHYSICS, SAVE_KEY, MISSIONS } from './config.js';
import { makeRng, clamp } from './random.js';
import {
  createGameState, currentMission, currentStep, missionTrackerText,
  commitCrime, updateWantedDecay, startMission, checkPositionStep,
  registerMissionKill, damagePlayer, healPlayer, bustPlayer, updateClock,
  clockText, isFiniteState, serializeSave, parseSave, applySave,
  advanceMissionStep, updateDriftScore, checkNearMiss,
} from './logic.js';
import { buildCity, isOnRoad } from './city.js';
import { createPlayer } from './player.js';
import { createCar, driveCar, spawnTraffic, updateTraffic, nearestCar, roadPosition, carName } from './cars.js';
import { spawnPedestrians, updatePedestrians, nearestPed } from './pedestrians.js';
import { createPoliceForce, setPoliceCount, updatePolice, policePanelData, policeInSight } from './police.js';
import { createMissionLayer, setBeacon, spawnEnemies, clearEnemies, updateEnemies, updateBeaconPulse } from './missions.js';
import { createCombat, firePistol, punchHit, updateCombat } from './combat.js';
import { createHud, showBanner, updateHud, drawMinimap, district } from './hud.js';
import { createAudio } from './audio.js';

const params = new URLSearchParams(location.search);
const SHOT = params.get('shot') || '';
const SEED = parseInt(params.get('seed') || '1', 10) || 1;
const rng = makeRng(SEED);

const state = createGameState(SEED);
const canvas = document.getElementById('game-canvas');

// ---------- Renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
const scene = new THREE.Scene();
// Golden hour: the clock starts at 18:24, so the sky is a warm sunset haze,
// not midday blue — the light, fog and sun all match the hour.
scene.background = new THREE.Color(0xf0a05c);
scene.fog = new THREE.Fog(0xf0a05c, 120, 420);
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);

const hemi = new THREE.HemisphereLight(0xffe0b0, 0x5a5148, 1.35);
scene.add(hemi);
scene.add(new THREE.AmbientLight(0xffffff, 0.25));
const sun = new THREE.DirectionalLight(0xffb060, 2.2);
sun.position.set(-160, 45, -40);
scene.add(sun);

// ---------- World ----------
const city = buildCity(scene, SEED);
const colliders = city.colliders;
const player = createPlayer(scene);
player.setPosition(0, 30, Math.PI);
const traffic = spawnTraffic(scene, 14, rng);
// A few parked cars, easy to steal.
const parked = [];
for (let i = 0; i < 6; i++) {
  const pos = roadPosition(rng);
  const color = PALETTE.car[rng.int(0, PALETTE.car.length - 1)];
  const car = createCar(scene, pos.x, pos.z, rng.range(0, Math.PI * 2), color, 'sedan');
  car.ai = null;
  parked.push(car);
}
const allCars = [...traffic, ...parked];
const peds = spawnPedestrians(scene, 28, rng);
const police = createPoliceForce(scene, makeRng(SEED + 31));
const missions = createMissionLayer(scene, SEED);
const combat = createCombat(scene);
const hud = createHud();
const audio = createAudio();

// Cash + health pickups scattered around the city.
const pickups = [];
function makePickup(kind, x, z) {
  const color = kind === 'cash' ? 0x37d67a : 0xffffff;
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1.1, 0.7, 1.1),
    new THREE.MeshLambertMaterial({ color }),
  );
  mesh.position.set(x, 0.9, z);
  scene.add(mesh);
  pickups.push({ kind, x, z, mesh, taken: false });
}
for (let i = 0; i < 8; i++) makePickup('cash', rng.range(-240, 240), rng.range(-240, 240));
for (let i = 0; i < 4; i++) makePickup('health', rng.range(-240, 240), rng.range(-240, 240));

// ---------- Input ----------
const input = {
  forward: false, back: false, left: false, right: false, run: false,
};
const keys = {};
let camYaw = Math.PI; // behind the player (player faces +z at spawn)
let camPitch = 0.42;
let camDist = 11; // round-2 polish: slightly wider default view of the street
let dragging = false;
let lastMouseX = 0;
let lastMouseY = 0;

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  keys[e.code] = true;
  audio.unlock();
  if (e.code === 'KeyP' || e.code === 'Escape') togglePause();
  if (e.code === 'KeyM') tryStartMission();
  if (e.code === 'KeyE') tryEnterExitCar();
  if (e.code === 'KeyF') tryPunch();
  if (e.code === 'KeyR' && screenState === 'playing') audio.nextStation();
  if (e.code === 'KeyR' && (screenState === 'busted' || screenState === 'wasted' || screenState === 'won')) restart();
  if (e.code === 'KeyN') audio.toggleMute();
  updateInputFlags();
});
window.addEventListener('keyup', (e) => {
  keys[e.code] = false;
  updateInputFlags();
});
function updateInputFlags() {
  input.forward = !!(keys.KeyW || keys.ArrowUp);
  input.back = !!(keys.KeyS || keys.ArrowDown);
  input.left = !!(keys.KeyA || keys.ArrowLeft);
  input.right = !!(keys.KeyD || keys.ArrowRight);
  input.run = !!keys.ShiftLeft || !!keys.ShiftRight;
}
canvas.addEventListener('mousedown', (e) => {
  dragging = true;
  lastMouseX = e.clientX;
  lastMouseY = e.clientY;
  audio.unlock();
  if (screenState === 'playing' && !currentCar) tryShoot();
});
window.addEventListener('mousemove', (e) => {
  if (!dragging) return;
  camYaw -= (e.clientX - lastMouseX) * 0.005;
  camPitch = clamp(camPitch + (e.clientY - lastMouseY) * 0.003, 0.12, 1.1);
  lastMouseX = e.clientX;
  lastMouseY = e.clientY;
});
window.addEventListener('mouseup', () => { dragging = false; });
canvas.addEventListener('wheel', (e) => {
  camDist = clamp(camDist + Math.sign(e.deltaY) * 1.5, 6, 22);
}, { passive: true });
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- Screens ----------
let screenState = 'title'; // title | playing | paused | busted | wasted | won
let currentCar = null;
let lastWanted = 0;
let saveTimer = 0;
let missionBannerShown = false;

const screens = {
  title: document.getElementById('screen-title'),
  pause: document.getElementById('screen-pause'),
  busted: document.getElementById('screen-busted'),
  wasted: document.getElementById('screen-wasted'),
  won: document.getElementById('screen-won'),
};
const hudEl = document.getElementById('hud');
function showScreen(name) {
  for (const [key, el] of Object.entries(screens)) {
    if (el) el.classList.toggle('hidden', key !== name);
  }
  // The HUD stays visible behind pause, but end screens hide its stale values.
  hudEl.classList.toggle('hidden', name === 'title' || name === 'busted' || name === 'wasted' || name === 'won');
}
document.getElementById('btn-start').addEventListener('click', () => {
  audio.unlock();
  startPlaying();
});
document.getElementById('btn-resume').addEventListener('click', () => togglePause());
document.getElementById('btn-restart-busted').addEventListener('click', restart);
document.getElementById('btn-restart-wasted').addEventListener('click', restart);
document.getElementById('btn-restart-won').addEventListener('click', restart);
document.getElementById('btn-continue').addEventListener('click', () => togglePause());

function startPlaying() {
  screenState = 'playing';
  showScreen(null);
  const mission = currentMission(state);
  if (mission) showBanner(hud, 'VICE HARBOR', `Press M to start: ${mission.name}`, 4);
}

function togglePause() {
  if (screenState === 'playing') {
    screenState = 'paused';
    showScreen('pause');
  } else if (screenState === 'paused') {
    screenState = 'playing';
    showScreen(null);
  }
}

function restart() {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* storage unavailable */ }
  location.reload();
}

// ---------- Save ----------
function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return;
    const save = parseSave(raw);
    if (save) applySave(state, save);
  } catch { /* ignore corrupt saves */ }
}
function writeSave() {
  try { localStorage.setItem(SAVE_KEY, serializeSave(state)); } catch { /* ignore */ }
}
loadSave();

// ---------- Mission helpers ----------
function tryStartMission() {
  if (screenState !== 'playing' || state.missionActive) return;
  const mission = currentMission(state);
  if (!mission) return;
  if (startMission(state)) {
    showBanner(hud, `MISSION: ${mission.name}`, mission.intro, 4.5);
    audio.pickup();
    missionBannerShown = true;
    syncMissionWorld();
    writeSave();
  }
}

function syncMissionWorld() {
  const step = currentStep(state);
  if (!state.missionActive || !step) {
    setBeacon(missions, 0, 0, false);
    clearEnemies(missions);
    return;
  }
  if (step.type === 'goto' || step.type === 'escape') {
    setBeacon(missions, step.x, step.z, step.type === 'goto');
    clearEnemies(missions);
  } else if (step.type === 'defeat') {
    setBeacon(missions, step.x, step.z, true);
    spawnEnemies(missions, step, step.count);
  }
}

function onMissionStepResult(result) {
  if (result === 'complete') {
    const done = state.missionsDone[state.missionsDone.length - 1];
    const mission = MISSIONS_BY_ID[done];
    showBanner(hud, 'MISSION COMPLETE', mission ? `${mission.name} — $${mission.reward.toLocaleString('en-US')}` : '', 4);
    audio.missionDone();
    writeSave();
    if (state.won) {
      screenState = 'won';
      showScreen('won');
      document.getElementById('won-stats').textContent =
        `Cash $${Math.floor(state.cash).toLocaleString('en-US')} · ${state.kills} gang members down · ${state.carsStolen} cars stolen`;
      writeSave();
    } else {
      const next = currentMission(state);
      if (next) setTimeout(() => showBanner(hud, `NEXT: ${next.name}`, 'Press M to start', 3.5), 4200);
    }
  } else if (result === 'step') {
    showBanner(hud, 'OBJECTIVE DONE', missionTrackerText(state), 3);
    audio.pickup();
  }
  syncMissionWorld();
}
const MISSIONS_BY_ID = {};
for (const m of MISSIONS) MISSIONS_BY_ID[m.id] = m;

// ---------- Car enter / steal ----------
function tryEnterExitCar() {
  if (screenState !== 'playing') return;
  if (currentCar) {
    currentCar.occupied = false;
    currentCar.speed = 0;
    const px = currentCar.x - Math.sin(currentCar.heading) * 3;
    const pz = currentCar.z - Math.cos(currentCar.heading) * 3;
    player.setPosition(px, pz, currentCar.heading);
    currentCar = null;
    camDist = 10;
    return;
  }
  const car = nearestCar(allCars, player.state.x, player.state.z, 4.5);
  if (!car) return;
  const wasTraffic = car.ai !== null && !car.occupied;
  currentCar = car;
  car.occupied = true;
  car.speed = 0;
  camDist = 14;
  if (wasTraffic) {
    state.carsStolen += 1;
    commitCrime(state, 'steal');
    showBanner(hud, 'CAR STOLEN', 'The harbor police noticed. Lose them!', 2.5);
    audio.pickup();
  }
}

// ---------- Combat actions ----------
function tryPunch() {
  if (screenState !== 'playing' || currentCar) return;
  if (!player.punch()) return;
  audio.punch();
  const targets = [
    ...missions.enemies.filter((e) => e.state === 'alive'),
    ...peds.filter((p) => p.state !== 'down'),
  ];
  const hit = punchHit(player.state, targets);
  if (hit) {
    hit.health -= PLAYER.punchDamage;
    if (hit.health <= 0) onTargetDown(hit);
    else if (hit.state !== undefined && missions.enemies.includes(hit)) {
      // gang member staggers; nothing extra needed
    } else {
      commitCrime(state, 'assault');
      if (hit.state) hit.state = 'flee';
    }
  }
}

function tryShoot() {
  if (screenState !== 'playing' || currentCar) return;
  const targets = [
    ...missions.enemies.filter((e) => e.state === 'alive'),
    ...peds.filter((p) => p.state !== 'down'),
  ];
  const shooter = { x: player.state.x, z: player.state.z, heading: camYaw };
  // Aim with the camera: shoot toward where the camera looks.
  const hit = firePistol(combat, shooter, targets, (target) => {
    state.shotsFired += 1;
    audio.gunshot();
    if (target) {
      target.health -= PLAYER.pistolDamage;
      if (target.health <= 0) onTargetDown(target);
      else if (missions.enemies.includes(target)) commitCrime(state, 'shoot');
      else commitCrime(state, 'shoot');
    } else {
      commitCrime(state, 'shoot');
    }
  });
  void hit;
}

function onTargetDown(target) {
  if (missions.enemies.includes(target)) {
    target.state = 'dead';
    target.group.visible = false;
    state.cash += 25;
    const result = registerMissionKill(state);
    if (result) onMissionStepResult(result);
    else showBanner(hud, 'GANG MEMBER DOWN', `${state.missionKills} down`, 1.6);
  } else {
    // pedestrian down
    target.state = 'down';
    target.group.rotation.z = Math.PI / 2;
    target.group.position.y = 0.3;
    commitCrime(state, 'assault');
  }
}

// ---------- Shot staging (deterministic scenes for screenshots) ----------
function stageShot() {
  if (!SHOT) return;
  screenState = 'playing';
  showScreen(null);
  if (SHOT === 'start') {
    screenState = 'title';
    showScreen('title');
    return;
  }
  if (SHOT === 'cover' || SHOT === 'chase') {
    // Driving at speed with a police chase and a live mission.
    // The road is clear of lamp poles (lamps never stand on a road), and the
    // camera sits a touch off-axis so the street runs diagonally, not dead
    // centre — the player's car, the pursuit and the HUD all read at once.
    const car = parked[0];
    car.x = 100; car.z = -30; car.heading = Math.PI / 2; car.speed = 26;
    car.group.position.set(100, 0, -30);
    car.group.rotation.y = car.heading;
    currentCar = car;
    car.occupied = true;
    player.setPosition(100, -30, Math.PI / 2);
    camYaw = Math.PI / 2 + 0.06; // camera behind the car, slightly off-axis
    camDist = 12;
    state.wanted = SHOT === 'cover' ? 3 : 2;
    state.lastCrimeAt = state.time;
    state.missionActive = true;
    state.missionIndex = 2; // Warehouse Heat
    state.missionStep = 0;
    state.missionKills = 1;
    // Mid-game state, consistent with missions 1-2 already done.
    state.missionsDone = [1, 2];
    state.cash = 1850;
    setPoliceCount(police, state.wanted, 100, -30);
    // Park police cars close behind and beside the player so the chase reads in frame.
    if (police.cars[0]) {
      const pc = police.cars[0].car;
      pc.x = 86; pc.z = -24; pc.heading = Math.PI / 2; pc.speed = 30;
      pc.group.position.set(86, 0, -24);
      pc.group.rotation.y = Math.PI / 2;
    }
    if (police.cars[1]) {
      const pc = police.cars[1].car;
      pc.x = 112; pc.z = -26.8; pc.heading = Math.PI / 2; pc.speed = 28;
      pc.group.position.set(112, 0, -26.8);
      pc.group.rotation.y = Math.PI / 2;
    }
    if (police.cars[2]) {
      const pc = police.cars[2].car;
      pc.x = 124; pc.z = -34; pc.heading = Math.PI / 2; pc.speed = 28;
      pc.group.position.set(124, 0, -34);
      pc.group.rotation.y = Math.PI / 2;
    }
    syncMissionWorld();
  } else if (SHOT === 'mission') {
    // On foot on the road south of the warehouse, facing the gang + beacon.
    player.setPosition(150, -125, Math.PI);
    camYaw = Math.PI;
    camDist = 11;
    state.missionActive = true;
    state.missionIndex = 2;
    state.missionStep = 0;
    state.missionKills = 0;
    state.wanted = 1;
    syncMissionWorld();
    setPoliceCount(police, 1, 150, -125);
  } else if (SHOT === 'win') {
    state.missionIndex = 5;
    state.missionsDone = [1, 2, 3, 4, 5];
    state.won = true;
    state.cash = 6750;
    screenState = 'won';
    showScreen('won');
    document.getElementById('won-stats').textContent =
      'Cash $6,750 · 10 gang members down · 6 cars stolen';
  }
}
stageShot();

// ---------- Main loop ----------
const clock = new THREE.Clock();
let fpsAccum = 0;
let frames = 0;

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const playing = screenState === 'playing';

  if (playing) {
    updateClock(state, dt);
    updateWantedDecay(state, dt);
    if (state.wanted !== lastWanted) {
      setPoliceCount(police, state.wanted, player.state.x, player.state.z);
      lastWanted = state.wanted;
    }
    // Movement.
    if (currentCar) {
      driveCar(currentCar, input, dt, colliders);
      player.state.x = currentCar.x;
      player.state.z = currentCar.z;
      player.state.heading = currentCar.heading;
      player.group.position.set(currentCar.x, 0, currentCar.z);
      player.group.visible = false;
      // Score feedback: drift chains and near misses pay real cash.
      updateDriftScore(state, currentCar.steering, currentCar.speed, dt);
      checkNearMiss(state, currentCar, allCars);
    } else {
      player.group.visible = true;
      player.update(dt, input, camYaw, colliders);
    }
    updateTraffic(traffic, dt, rng);
    const threat = state.wanted > 0 || combat.cooldown > 0
      ? { x: player.state.x, z: player.state.z }
      : null;
    updatePedestrians(peds, dt, rng, threat);
    updateCombat(combat, dt);
    updateBeaconPulse(missions, dt);

    // Police chase + bust check.
    const busted = updatePolice(police, dt, player.state, !!currentCar, colliders);
    if ((busted && !state.busted) || (state.wasted && screenState === 'playing')) {
      if (state.wasted) {
        screenState = 'wasted';
        showScreen('wasted');
        audio.busted();
        writeSave();
      } else {
        bustPlayer(state);
        screenState = 'busted';
        showScreen('busted');
        audio.busted();
        writeSave();
      }
    }
    // Gang enemies shoot back.
    updateEnemies(missions, dt, player.state, (dmg) => {
      const result = damagePlayer(state, dmg);
      if (result === 'wasted') {
        screenState = 'wasted';
        showScreen('wasted');
        audio.busted();
        writeSave();
      }
    });
    // Police cars ramming the player on foot hurt.
    const ram = police.cars.find((u) => Math.hypot(u.car.x - player.state.x, u.car.z - player.state.z) < 2.6);
    if (ram && !currentCar) {
      const result = damagePlayer(state, 12 * dt * 3);
      if (result === 'wasted') {
        screenState = 'wasted';
        showScreen('wasted');
        writeSave();
      }
    }

    // Mission position checks.
    const stepResult = checkPositionStep(state, player.state.x, player.state.z);
    if (stepResult) onMissionStepResult(stepResult);

    // Pickups.
    for (const pk of pickups) {
      if (pk.taken) continue;
      pk.mesh.rotation.y += dt * 2;
      pk.mesh.position.y = 0.9 + Math.sin(state.time * 3 + pk.x) * 0.15;
      if (Math.hypot(pk.x - player.state.x, pk.z - player.state.z) < 2.2) {
        pk.taken = true;
        pk.mesh.visible = false;
        if (pk.kind === 'cash') {
          state.cash += 50;
          showBanner(hud, '+$50', 'Street cash', 1.4);
        } else {
          healPlayer(state, 40);
          showBanner(hud, '+40 HEALTH', 'First-aid kit', 1.4);
        }
        audio.pickup();
      }
    }

    // Audio follows the world.
    audio.setEngine(currentCar ? Math.abs(currentCar.speed) / CAR_PHYSICS.maxSpeed : 0, !!currentCar);
    audio.setSiren(state.wanted > 0, state.time);

    // Periodic save.
    // Round-3 polish: autosave every 12s instead of 10s, fewer writes mid-play.
    saveTimer += dt;
    if (saveTimer > 12) {
      saveTimer = 0;
      writeSave();
    }
    if (!isFiniteState(state)) console.error('VICE HARBOR: non-finite state detected');
  }

  // Camera: third-person follow, orbit with mouse drag.
  const targetX = player.state.x;
  const targetZ = player.state.z;
  const camX = targetX - Math.sin(camYaw) * camDist * Math.cos(camPitch);
  const camZ = targetZ - Math.cos(camYaw) * camDist * Math.cos(camPitch);
  const camY = 2.2 + camDist * Math.sin(camPitch);
  camera.position.set(camX, camY, camZ);
  camera.lookAt(targetX, 1.8, targetZ);

  if (playing) {
    const missionPos = state.missionActive && currentStep(state)
      ? { x: currentStep(state).x, z: currentStep(state).z }
      : null;
    const mission = currentMission(state);
    const step = currentStep(state);
    // Stage progress: the current step's share of the mission chain, plus
    // the kill count inside a defeat step.
    let stagePct = 0;
    if (mission && step) {
      const stepProgress = step.type === 'defeat' && step.count
        ? state.missionKills / step.count : 0;
      stagePct = ((state.missionStep + stepProgress) / mission.steps.length) * 100;
    }
    const nextStep = mission && state.missionStep + 1 < mission.steps.length
      ? mission.steps[state.missionStep + 1] : null;
    const nextMission = mission && state.missionStep + 1 >= mission.steps.length
      ? MISSIONS[state.missionIndex + 1] ?? null : null;
    updateHud(hud, state, {
      missionText: missionTrackerText(state),
      clockText: clockText(state),
      inCar: !!currentCar,
      speed: currentCar ? currentCar.speed : 0,
      interactHint: !currentCar && nearestCar(allCars, player.state.x, player.state.z, 4.5)
        ? 'Press E to steal the car'
        : (!state.missionActive && currentMission(state) ? 'Press M to start the mission' : ''),
      mission: mission ? {
        id: mission.id,
        name: mission.name,
        stage: state.missionActive ? state.missionStep + 1 : 1,
        stages: mission.steps.length,
        stagePct: state.missionActive ? stagePct : 0,
        next: state.missionActive
          ? (nextStep ? nextStep.label : (nextMission ? `MISSION ${nextMission.id}: ${nextMission.name}` : ''))
          : (mission.steps[0] ? mission.steps[0].label : ''),
      } : null,
      contact: state.missionActive && mission ? {
        name: mission.giver,
        initials: mission.giver.split(' ').map((w) => w[0]).join(''),
        say: mission.say,
      } : null,
      policeRows: policePanelData(police, player.state.x, player.state.z),
      inSight: policeInSight(police, player.state.x, player.state.z),
      carName: currentCar ? carName(currentCar) : null,
      carCondition: currentCar ? Math.round(currentCar.condition) : null,
      radio: audio.currentStation(),
      district: district(player.state.x, player.state.z),
    }, dt);
    drawMinimap(hud, { colliders, policeCars: police.cars }, player.state.x, player.state.z,
      currentCar ? currentCar.heading : player.state.heading, missionPos);
  }

  renderer.render(scene, camera);
  frames += 1;
  fpsAccum += dt;
  if (frames === 5) window.__VICE_READY__ = true;
}

animate();

// Debug / test hooks (used by the playtest, harmless in normal play).
window.__VICE__ = {
  state,
  get screenState() { return screenState; },
  get inCar() { return !!currentCar; },
  get playerPos() { return { x: player.state.x, z: player.state.z }; },
  get policeCount() { return police.cars.length + police.cops.length; },
  get enemiesAlive() { return missions.enemies.filter((e) => e.state === 'alive').length; },
  debug: {
    teleport(x, z) { player.setPosition(x, z, 0); if (currentCar) { currentCar.x = x; currentCar.z = z; } },
    setWanted(n) { state.wanted = n; state.lastCrimeAt = state.time; },
    startMission() { tryStartMission(); },
    enterNearestCar() { tryEnterExitCar(); },
    stealTrafficCar() {
      // Debug helper: walk up to the nearest moving traffic car and steal it.
      let best = null;
      let bd = Infinity;
      for (const car of traffic) {
        if (car.occupied) continue;
        const d = Math.hypot(car.x - player.state.x, car.z - player.state.z);
        if (d < bd) { bd = d; best = car; }
      }
      if (!best) return false;
      player.setPosition(best.x + 2.5, best.z, 0);
      tryEnterExitCar();
      return true;
    },
    damage(n) { return damagePlayer(state, n); },
    completeStep() {
      const step = currentStep(state);
      if (!step) return null;
      if (step.type === 'defeat') {
        for (const e of missions.enemies) { e.state = 'dead'; e.group.visible = false; }
        state.missionKills = step.count;
      }
      const result = advanceMissionStep(state);
      if (result) onMissionStepResult(result);
      return result;
    },
  },
};
