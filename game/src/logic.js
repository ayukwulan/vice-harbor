// VICE HARBOR — pure game logic (no DOM, no three.js).
// Node can import this file directly, so the playtest exercises the real rules.
import { MISSIONS, PLAYER, WANTED, SAVE_KEY } from './config.js';
import { clamp, dist2d } from './random.js';

export function createGameState(seed = 1) {
  return {
    seed,
    time: 0, // seconds since session start
    clockMinutes: 18 * 60 + 24, // 18:24, golden hour
    day: 1, // increments each time the clock rolls past midnight
    cash: 250,
    health: PLAYER.maxHealth,
    wanted: 0,
    lastCrimeAt: -9999,
    lastDecayAt: 0,
    busted: false,
    wasted: false,
    won: false,
    missionsDone: [],
    missionIndex: 0, // index into MISSIONS, 0-based
    missionStep: 0,
    missionActive: false,
    missionKills: 0,
    missionStartedAt: 0,
    kills: 0,
    carsStolen: 0,
    shotsFired: 0,
    log: [],
    // Score feedback: drift chains and near misses pay cash and flash a popup.
    drift: { active: false, time: 0 },
    scorePopup: null, // { text } — the HUD shows it while scorePopupTimer > 0
    scorePopupTimer: 0,
  };
}

export function currentMission(state) {
  if (state.missionIndex >= MISSIONS.length) return null;
  return MISSIONS[state.missionIndex];
}

export function currentStep(state) {
  const mission = currentMission(state);
  if (!mission) return null;
  return mission.steps[state.missionStep] ?? null;
}

export function missionTrackerText(state) {
  const mission = currentMission(state);
  if (!mission) return 'All missions complete — Vice Harbor is yours.';
  if (!state.missionActive) return `Next: ${mission.name} — press M to start`;
  const step = currentStep(state);
  if (!step) return mission.name;
  let label = step.label;
  if (step.type === 'defeat') {
    label = step.label.replace(/\(\d+\/\d+\)/, `(${state.missionKills}/${step.count})`);
  }
  return `${mission.name}: ${label}`;
}

export function addCrime(state, stars) {
  state.wanted = clamp(state.wanted + stars, 0, WANTED.maxStars);
  state.lastCrimeAt = state.time;
}

export function commitCrime(state, kind) {
  // kind: 'steal' | 'assault' | 'shoot' | 'killCop' | 'killGang'
  if (kind === 'steal') addCrime(state, 1);
  else if (kind === 'assault') addCrime(state, 1);
  else if (kind === 'shoot') addCrime(state, 2);
  else if (kind === 'killCop') addCrime(state, 2);
  else if (kind === 'killGang') addCrime(state, 0);
  state.log.push({ t: state.time, kind, wanted: state.wanted });
}

export function updateWantedDecay(state, dt) {
  if (state.wanted <= 0) return;
  if (state.time - state.lastCrimeAt < WANTED.decayDelay) return;
  if (state.time - state.lastDecayAt >= WANTED.decayStep) {
    state.wanted -= 1;
    state.lastDecayAt = state.time;
  }
}

export function wantedCopCount(state) {
  return WANTED.copsPerStar[state.wanted] ?? 0;
}

export function startMission(state) {
  const mission = currentMission(state);
  if (!mission || state.missionActive) return false;
  state.missionActive = true;
  state.missionStep = 0;
  state.missionKills = 0;
  state.missionStartedAt = state.time;
  return true;
}

export function advanceMissionStep(state) {
  const mission = currentMission(state);
  if (!mission) return false;
  state.missionStep += 1;
  state.missionKills = 0;
  if (state.missionStep >= mission.steps.length) {
    state.cash += mission.reward;
    state.missionsDone.push(mission.id);
    state.missionActive = false;
    state.missionStep = 0;
    state.missionIndex += 1;
    if (state.missionIndex >= MISSIONS.length) state.won = true;
    return 'complete';
  }
  return 'step';
}

// Check a goto/escape step against the player's position and wanted level.
// Returns 'step' | 'complete' | null.
export function checkPositionStep(state, px, pz) {
  if (!state.missionActive) return null;
  const step = currentStep(state);
  if (!step) return null;
  if (step.type === 'goto') {
    if (dist2d(px, pz, step.x, step.z) <= step.radius) return advanceMissionStep(state);
  } else if (step.type === 'escape') {
    if (state.wanted === 0) return advanceMissionStep(state);
  }
  return null;
}

// Register a kill on the current defeat step. Returns 'step' | 'complete' | null.
export function registerMissionKill(state) {
  if (!state.missionActive) return null;
  const step = currentStep(state);
  if (!step || step.type !== 'defeat') return null;
  state.missionKills += 1;
  state.kills += 1;
  if (state.missionKills >= step.count) return advanceMissionStep(state);
  return 'kill';
}

export function damagePlayer(state, amount) {
  if (state.wasted || state.busted) return 'dead';
  state.health = clamp(state.health - amount, 0, PLAYER.maxHealth);
  if (state.health <= 0) {
    state.wasted = true;
    return 'wasted';
  }
  return 'hurt';
}

export function healPlayer(state, amount) {
  state.health = clamp(state.health + amount, 0, PLAYER.maxHealth);
}

export function bustPlayer(state) {
  if (state.wasted) return false;
  state.busted = true;
  return true;
}

export function updateClock(state, dt) {
  state.time += dt;
  const next = state.clockMinutes + dt * 0.5;
  if (next >= 24 * 60) state.day += 1;
  state.clockMinutes = next % (24 * 60);
}

// --- Score feedback: drift chains and near misses ---------------------------
// Both trackers only read real driving state and pay real cash; the HUD shows
// state.scorePopup while scorePopupTimer > 0.
export function setScorePopup(state, text) {
  state.scorePopup = text;
  state.scorePopupTimer = 1.6;
}

// Drift: hard steering at speed. When the slide ends after 0.8s+, it pays
// $50 per whole second of drift and flashes DRIFT xN.
export function updateDriftScore(state, steering, speed, dt) {
  const drifting = Math.abs(steering) > 0.7 && Math.abs(speed) > 20;
  if (drifting) {
    state.drift.active = true;
    state.drift.time += dt;
    return;
  }
  if (!state.drift.active) return;
  const chain = Math.floor(state.drift.time);
  state.drift.active = false;
  state.drift.time = 0;
  if (chain >= 1) {
    const amount = 50 * chain;
    state.cash += amount;
    setScorePopup(state, `DRIFT ×${chain} +$${amount}`);
  }
}

// Near miss: another car passes within 4.5m of the player's car at speed
// without touching it (closer than 2.6m is a scrape, not a near miss).
// Each car pays at most once per 3 seconds.
export function checkNearMiss(state, playerCar, others) {
  if (!playerCar || Math.abs(playerCar.speed) < 15) return;
  for (const other of others) {
    if (!other || other === playerCar) continue;
    if (other.lastNearMissAt !== undefined && state.time - other.lastNearMissAt < 3) continue;
    const d = Math.hypot(other.x - playerCar.x, other.z - playerCar.z);
    if (d < 4.5 && d > 2.6) {
      other.lastNearMissAt = state.time;
      state.cash += 25;
      setScorePopup(state, 'NEAR MISS +$25');
    }
  }
}

export function clockText(state) {
  const h = Math.floor(state.clockMinutes / 60) % 24;
  const m = Math.floor(state.clockMinutes % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function isFiniteState(state) {
  const nums = [
    state.time, state.clockMinutes, state.day, state.cash, state.health,
    state.wanted, state.lastCrimeAt, state.missionIndex, state.missionStep,
    state.drift.time, state.scorePopupTimer,
  ];
  return nums.every((n) => Number.isFinite(n));
}

export function serializeSave(state) {
  return JSON.stringify({
    v: 1,
    cash: state.cash,
    missionsDone: state.missionsDone,
    missionIndex: state.missionIndex,
    kills: state.kills,
    carsStolen: state.carsStolen,
  });
}

export function parseSave(json) {
  try {
    const data = JSON.parse(json);
    if (!data || data.v !== 1) return null;
    if (!Number.isFinite(data.cash) || !Array.isArray(data.missionsDone)) return null;
    return {
      cash: Math.max(0, Math.floor(data.cash)),
      missionsDone: data.missionsDone.filter((n) => Number.isInteger(n)),
      missionIndex: Number.isInteger(data.missionIndex) ? data.missionIndex : 0,
      kills: Number.isInteger(data.kills) ? data.kills : 0,
      carsStolen: Number.isInteger(data.carsStolen) ? data.carsStolen : 0,
    };
  } catch {
    return null;
  }
}

export function applySave(state, save) {
  if (!save) return false;
  state.cash = save.cash;
  state.missionsDone = save.missionsDone;
  state.missionIndex = Math.min(save.missionIndex, MISSIONS.length);
  state.kills = save.kills;
  state.carsStolen = save.carsStolen;
  if (state.missionIndex >= MISSIONS.length) state.won = true;
  return true;
}

export function saveKey() {
  return SAVE_KEY;
}

// Simple combat resolution used by both the browser and the playtest:
// shooter at (sx,sz) facing angle `heading`, target at (tx,tz).
export function shotHits(shooter, target, range, halfAngle) {
  const dx = target.x - shooter.x;
  const dz = target.z - shooter.z;
  const d = Math.sqrt(dx * dx + dz * dz);
  if (d > range || d < 0.001) return false;
  const targetAngle = Math.atan2(dx, dz);
  let diff = targetAngle - shooter.heading;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return Math.abs(diff) <= halfAngle;
}
