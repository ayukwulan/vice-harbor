// VICE HARBOR — HUD: health, rep, cash, wanted stars, mission tracker with
// stage + next, police response panel, contact dialogue, weapon slots,
// car name + condition, radio, score popups, and a 2D canvas minimap.
import { CITY } from './config.js';

const REP_TITLES = ['ROOKIE', 'HUSTLER', 'RUNNER', 'FIXER', 'SHADOW', 'KINGPIN'];

export function createHud() {
  const $ = (id) => document.getElementById(id);
  return {
    healthFill: $('health-fill'),
    healthText: $('health-text'),
    repFill: $('rep-fill'),
    repText: $('rep-text'),
    cashText: $('cash-text'),
    dayText: $('day-text'),
    clockText: $('clock-text'),
    starsEl: $('wanted-stars'),
    inSightEl: $('in-sight'),
    missionTitle: $('mission-title'),
    missionStageFill: $('mission-stage-fill'),
    missionStageText: $('mission-stage-text'),
    missionNext: $('mission-next'),
    missionText: $('mission-text'),
    policePanel: $('police-panel'),
    policeRows: $('police-rows'),
    policeCount: $('police-count'),
    contactBox: $('contact-box'),
    contactInitials: $('contact-initials'),
    contactName: $('contact-name'),
    contactSay: $('contact-say'),
    weaponFists: $('weapon-fists'),
    weaponPistol: $('weapon-pistol'),
    carName: $('car-name'),
    speedText: $('speed-text'),
    radioText: $('radio-text'),
    scorePopup: $('score-popup'),
    districtLabel: $('district-label'),
    minimap: $('minimap'),
    bannerEl: $('banner'),
    bannerTitle: $('banner-title'),
    bannerSub: $('banner-sub'),
    crosshair: $('crosshair'),
    interactEl: $('interact-hint'),
    ammoText: $('ammo-text'),
    bannerTimer: 0,
    lastPoliceKey: '',
    lastContactKey: '',
  };
}

export function showBanner(hud, title, sub = '', seconds = 3.2) {
  hud.bannerTitle.textContent = title;
  hud.bannerSub.textContent = sub;
  hud.bannerEl.classList.add('show');
  hud.bannerTimer = seconds;
}

// District name from a city position, for the minimap label.
export function district(x, z) {
  if (z < -180) return 'THE PIER';
  if (x > 120) return 'EAST WAREHOUSE';
  if (x < -120) return 'CORAL ROW';
  if (z > 150) return 'MARINA';
  if (z > 60) return 'SUNSET STRIP';
  return 'DOWNTOWN';
}

export function updateHud(hud, state, extra, dt) {
  // Health.
  const pct = Math.max(0, Math.round((state.health / 100) * 100));
  hud.healthFill.style.width = `${pct}%`;
  hud.healthFill.style.background = pct > 50 ? '#37d67a' : pct > 25 ? '#ffb02e' : '#ff3b30';
  hud.healthText.textContent = `${pct}`;
  // Respect: one rank per completed mission — real progress, not a fake stat.
  const rep = state.missionsDone.length;
  hud.repFill.style.width = `${(rep / 5) * 100}%`;
  hud.repText.textContent = `REP ${rep} · ${REP_TITLES[rep] ?? 'KINGPIN'}`;
  // Cash, day, clock.
  hud.cashText.textContent = `$${Math.floor(state.cash).toLocaleString('en-US')}`;
  hud.dayText.textContent = `DAY ${state.day}`;
  hud.clockText.textContent = extra.clockText;
  // Wanted stars + IN SIGHT.
  let stars = '';
  for (let i = 0; i < 5; i++) stars += i < state.wanted ? '★' : '☆';
  hud.starsEl.textContent = stars;
  hud.starsEl.classList.toggle('hot', state.wanted >= 3);
  hud.inSightEl.style.display = extra.inSight && state.wanted > 0 ? 'block' : 'none';
  // Mission: title, stage bar, next objective, current step label.
  if (extra.mission) {
    const m = extra.mission;
    hud.missionTitle.textContent = `MISSION ${m.id}/5 — ${m.name}`;
    hud.missionStageFill.style.width = `${m.stagePct}%`;
    hud.missionStageText.textContent = `STAGE ${m.stage}/${m.stages}`;
    hud.missionNext.textContent = m.next ? `NEXT ▸ ${m.next}` : '';
    hud.missionNext.style.display = m.next ? 'block' : 'none';
  } else {
    hud.missionTitle.textContent = 'VICE HARBOR IS YOURS';
    hud.missionStageFill.style.width = '100%';
    hud.missionStageText.textContent = 'ALL MISSIONS COMPLETE';
    hud.missionNext.style.display = 'none';
  }
  hud.missionText.textContent = extra.missionText;
  // Police response panel — rebuilt only when the rows actually change.
  const rows = extra.policeRows ?? [];
  const key = rows.map((r) => `${r.name}|${r.dist}|${r.behaviour}`).join(';');
  if (key !== hud.lastPoliceKey) {
    hud.lastPoliceKey = key;
    if (rows.length === 0) {
      hud.policePanel.style.display = 'none';
    } else {
      hud.policePanel.style.display = 'block';
      hud.policeCount.textContent = `${rows.length} UNIT${rows.length > 1 ? 'S' : ''}`;
      hud.policeRows.innerHTML = rows.map((r) =>
        `<div class="police-row"><span class="police-name">${r.name}</span>` +
        `<span class="police-dist">${r.dist} m</span>` +
        `<span class="police-behaviour">${r.behaviour}</span></div>`).join('');
    }
  }
  // Contact dialogue — shown while a mission is active.
  const contact = extra.contact;
  const cKey = contact ? `${contact.name}|${contact.say}` : '';
  if (cKey !== hud.lastContactKey) {
    hud.lastContactKey = cKey;
    if (!contact) {
      hud.contactBox.style.display = 'none';
    } else {
      hud.contactBox.style.display = 'flex';
      hud.contactInitials.textContent = contact.initials;
      hud.contactName.textContent = contact.name;
      hud.contactSay.textContent = contact.say;
    }
  }
  // Weapon slots: fists + pistol (infinite ammo). Pistol is the active
  // weapon on foot; both dim while driving.
  hud.weaponPistol.classList.toggle('active', !extra.inCar);
  hud.weaponFists.classList.toggle('active', false);
  // Car name + condition, speedometer.
  if (extra.inCar && extra.carName) {
    hud.carName.style.display = 'block';
    hud.carName.textContent = `${extra.carName} · CONDITION ${extra.carCondition}%`;
    hud.speedText.textContent = `${Math.round(Math.abs(extra.speed) * 3.6)} km/h`;
  } else {
    hud.carName.style.display = 'none';
    hud.speedText.textContent = '';
  }
  // Radio: the station actually playing.
  if (extra.radio) {
    hud.radioText.textContent = `♪ ${extra.radio.station} — ${extra.radio.track}`;
  }
  // Score popup (drift / near miss): show while its timer runs.
  if (state.scorePopup && state.scorePopupTimer > 0) {
    hud.scorePopup.textContent = state.scorePopup;
    hud.scorePopup.classList.add('show');
    state.scorePopupTimer -= dt;
    if (state.scorePopupTimer <= 0) {
      hud.scorePopup.classList.remove('show');
      state.scorePopup = null;
    }
  } else {
    hud.scorePopup.classList.remove('show');
  }
  hud.ammoText.textContent = extra.inCar ? 'DRIVE — E to exit' : 'PISTOL ∞ — click to fire, F to punch';
  hud.crosshair.style.display = extra.inCar ? 'none' : 'block';
  hud.interactEl.style.display = extra.interactHint ? 'block' : 'none';
  if (extra.interactHint) hud.interactEl.textContent = extra.interactHint;
  if (extra.district) hud.districtLabel.textContent = extra.district;
  if (hud.bannerTimer > 0) {
    hud.bannerTimer -= dt;
    if (hud.bannerTimer <= 0) hud.bannerEl.classList.remove('show');
  }
}

// Top-down minimap: roads, buildings, water, player, police, mission marker.
export function drawMinimap(hud, world, px, pz, heading, missionPos) {
  const canvas = hud.minimap;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const half = CITY.half + 40;
  const toMap = (x, z) => [((x + half) / (half * 2)) * W, ((z + half) / (half * 2)) * H];
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#1c2836';
  ctx.fillRect(0, 0, W, H);
  // harbor water
  ctx.fillStyle = '#2a7a8c';
  const [, wy] = toMap(0, -CITY.half - 30);
  ctx.fillRect(0, 0, W, Math.max(0, wy + 8));
  // roads — brighter so the grid reads at a glance
  ctx.strokeStyle = '#6a7078';
  ctx.lineWidth = 6;
  for (let i = 0; i <= 9; i++) {
    const c = -270 + i * 60;
    const [x] = toMap(c, 0);
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    const [, y] = toMap(0, c);
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }
  // buildings
  ctx.fillStyle = '#93a5ba';
  for (const col of world.colliders) {
    const [x1, y1] = toMap(col.minX, col.minZ);
    const [x2, y2] = toMap(col.maxX, col.maxZ);
    ctx.fillRect(x1, y1, Math.max(1, x2 - x1), Math.max(1, y2 - y1));
  }
  // mission marker
  if (missionPos) {
    const [mx, my] = toMap(missionPos.x, missionPos.z);
    ctx.fillStyle = '#ffe14d';
    ctx.beginPath(); ctx.arc(mx, my, 6, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#ffe14d';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(mx, my, 10, 0, Math.PI * 2); ctx.stroke();
  }
  // police blips
  ctx.fillStyle = '#4d8dff';
  for (const unit of world.policeCars ?? []) {
    const [bx, by] = toMap(unit.car.x, unit.car.z);
    ctx.beginPath(); ctx.arc(bx, by, 4, 0, Math.PI * 2); ctx.fill();
  }
  // player arrow
  const [pxm, pzm] = toMap(px, pz);
  ctx.save();
  ctx.translate(pxm, pzm);
  ctx.rotate(Math.atan2(Math.sin(heading), Math.cos(heading)));
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(0, -7); ctx.lineTo(5, 6); ctx.lineTo(-5, 6); ctx.closePath();
  ctx.fill();
  ctx.restore();
  // North marker at the top of the dial.
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 13px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('N', W / 2, 14);
}
