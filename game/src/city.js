// VICE HARBOR — procedural city: roads, buildings, props, harbor.
// All geometry is generated from the seed; no external assets.
import * as THREE from 'three';
import { CITY, PALETTE } from './config.js';
import { makeRng } from './random.js';

const PITCH = CITY.blockSize + CITY.roadWidth; // 60
const ROAD_AT = [];
for (let i = 0; i <= CITY.blocks; i++) ROAD_AT.push(-CITY.half + i * PITCH);
const ROAD_HALF = CITY.roadWidth / 2;

export function isOnRoad(x, z) {
  for (const r of ROAD_AT) {
    if (Math.abs(x - r) < ROAD_HALF + 0.5) return true;
    if (Math.abs(z - r) < ROAD_HALF + 0.5) return true;
  }
  return false;
}

export function nearestRoadCoord(v) {
  let best = ROAD_AT[0];
  let bd = Infinity;
  for (const r of ROAD_AT) {
    const d = Math.abs(v - r);
    if (d < bd) {
      bd = d;
      best = r;
    }
  }
  return best;
}

export function clampToCity(x, z) {
  const lim = CITY.half + 30;
  return [Math.max(-lim, Math.min(lim, x)), Math.max(-lim, Math.min(lim, z))];
}

function facadeTexture(baseColor, litRatio, rng) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, 128, 256);
  // subtle vertical shading
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, 'rgba(255,255,255,0.10)');
  grad.addColorStop(1, 'rgba(0,0,0,0.25)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 256);
  // window grid
  for (let row = 0; row < 12; row++) {
    for (let col = 0; col < 6; col++) {
      const lit = rng.next() < litRatio;
      ctx.fillStyle = lit ? '#ffd98a' : 'rgba(20,28,38,0.85)';
      ctx.fillRect(10 + col * 19, 12 + row * 20, 12, 12);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function neonSign(text, color, rng) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#101018';
  ctx.fillRect(0, 0, 256, 64);
  ctx.font = 'bold 34px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = color;
  ctx.shadowBlur = 18;
  ctx.fillStyle = color;
  ctx.fillText(text, 128, 34);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildCity(scene, seed) {
  const rng = makeRng(seed);
  const colliders = []; // {minX,maxX,minZ,maxZ}
  const landmarks = {}; // named positions for missions
  const group = new THREE.Group();
  group.name = 'city';
  scene.add(group);

  // Ground: big asphalt base + grass/sand fringe beyond the grid.
  const groundMat = new THREE.MeshLambertMaterial({ color: 0x4a4f55 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(CITY.half * 2 + 220, CITY.half * 2 + 220), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.05;
  group.add(ground);

  // Harbor water on the south edge (z negative side is the pier district).
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY.half * 2 + 220, 90),
    new THREE.MeshLambertMaterial({ color: 0x1d4e5e }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, 0.02, -CITY.half - 75);
  group.add(water);

  // Roads: dark strips + sidewalk strips + dashed center lines.
  const roadMat = new THREE.MeshLambertMaterial({ color: PALETTE.road });
  const walkMat = new THREE.MeshLambertMaterial({ color: PALETTE.sidewalk });
  const lineMat = new THREE.MeshBasicMaterial({ color: PALETTE.roadLine });
  for (const r of ROAD_AT) {
    for (const horizontal of [true, false]) {
      const strip = new THREE.Mesh(
        new THREE.PlaneGeometry(CITY.half * 2 + 60, CITY.roadWidth),
        roadMat,
      );
      strip.rotation.x = -Math.PI / 2;
      if (!horizontal) strip.rotation.z = Math.PI / 2;
      strip.position.set(horizontal ? 0 : r, 0.0, horizontal ? r : 0);
      group.add(strip);
      // dashed center line
      for (let t = -CITY.half; t < CITY.half; t += 12) {
        const dash = new THREE.Mesh(new THREE.PlaneGeometry(5, 0.5), lineMat);
        dash.rotation.x = -Math.PI / 2;
        if (!horizontal) dash.rotation.z = Math.PI / 2;
        dash.position.set(horizontal ? t : r, 0.06, horizontal ? r : t);
        group.add(dash);
      }
    }
  }

  // Buildings, one block at a time.
  const facadeMats = PALETTE.building.map((c, i) => {
    const hex = '#' + c.toString(16).padStart(6, '0');
    return new THREE.MeshLambertMaterial({
      map: facadeTexture(hex, 0.5 + i * 0.04, rng),
    });
  });
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x2a2d33 });
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);

  function addBuilding(cx, cz, w, d, h, matIndex, signText) {
    const mat = facadeMats[matIndex % facadeMats.length];
    const mesh = new THREE.Mesh(boxGeo, mat);
    mesh.scale.set(w, h, d);
    mesh.position.set(cx, h / 2, cz);
    group.add(mesh);
    const roof = new THREE.Mesh(boxGeo, roofMat);
    roof.scale.set(w + 0.6, 0.6, d + 0.6);
    roof.position.set(cx, h + 0.3, cz);
    group.add(roof);
    colliders.push({
      minX: cx - w / 2 - 0.4, maxX: cx + w / 2 + 0.4,
      minZ: cz - d / 2 - 0.4, maxZ: cz + d / 2 + 0.4,
    });
    if (signText) {
      const color = '#' + PALETTE.neon[rng.int(0, PALETTE.neon.length - 1)].toString(16).padStart(6, '0');
      const sign = new THREE.Mesh(
        new THREE.PlaneGeometry(Math.min(w * 0.9, 18), 4.5),
        new THREE.MeshBasicMaterial({ map: neonSign(signText, color, rng) }),
      );
      sign.position.set(cx, Math.min(h - 2, 14), cz + d / 2 + 0.3);
      group.add(sign);
    }
    return mesh;
  }

  const namedBlocks = {
    'club': { bx: 1, bz: -1, sign: 'CLUB NEON' },
    'arcade': { bx: -1, bz: 1, sign: 'ARCADE' },
    'motel': { bx: 2, bz: 0, sign: 'MOTEL' },
    'warehouse': { bx: 2, bz: -2, sign: 'WAREHOUSE' },
    'tower': { bx: -3, bz: 3, sign: 'MARINA TOWER' },
  };

  for (let bx = -4; bx <= 4; bx++) {
    for (let bz = -4; bz <= 4; bz++) {
      // block center: roads sit at -half + i*pitch; block centers sit halfway between
      const blockCx = -CITY.half + (bx + 4.5) * PITCH;
      const blockCz = -CITY.half + (bz + 4.5) * PITCH;
      // A couple of open plazas / parking lots instead of buildings.
      const key = `${bx},${bz}`;
      if (key === '0,0' || key === '-2,2' || key === '3,1') {
        // plaza: planters + benches, no collider buildings
        const plaza = new THREE.Mesh(
          new THREE.PlaneGeometry(CITY.blockSize, CITY.blockSize),
          new THREE.MeshLambertMaterial({ color: 0x6b7d5a }),
        );
        plaza.rotation.x = -Math.PI / 2;
        plaza.position.set(blockCx, 0.08, blockCz);
        group.add(plaza);
        continue;
      }
      const isNamed = Object.entries(namedBlocks).find(([, v]) => v.bx === bx && v.bz === bz);
      const n = isNamed ? 1 : rng.int(1, 3);
      if (n === 1) {
        const h = isNamed && isNamed[0] === 'tower' ? 62 : rng.range(16, 42);
        addBuilding(blockCx, blockCz, CITY.blockSize - 6, CITY.blockSize - 6, h,
          rng.int(0, PALETTE.building.length - 1), isNamed ? isNamed[1].sign : null);
      } else {
        for (let k = 0; k < n; k++) {
          const w = CITY.blockSize / 2 - 4;
          const ox = (k % 2 === 0 ? -1 : 1) * (CITY.blockSize / 4);
          const oz = (k < 2 ? -1 : 1) * (CITY.blockSize / 4);
          addBuilding(blockCx + ox, blockCz + oz, w, w, rng.range(10, 30),
            rng.int(0, PALETTE.building.length - 1), null);
        }
      }
    }
  }

  // Landmark positions (mission targets sit on roads/plazas near these blocks).
  landmarks.club = { x: 92, z: -92 };
  landmarks.pier = { x: -150, z: -150 };
  landmarks.warehouse = { x: 150, z: -150 };
  landmarks.tower = { x: -180, z: 180 };
  landmarks.toll = { x: -30, z: 180 };

  // Pier: wooden deck reaching into the harbor + crates.
  const pierMat = new THREE.MeshLambertMaterial({ color: 0x7a5c38 });
  const pier = new THREE.Mesh(new THREE.BoxGeometry(24, 1.2, 46), pierMat);
  pier.position.set(-150, 0.6, -CITY.half - 38);
  group.add(pier);
  colliders.push({ minX: -163, maxX: -137, minZ: -CITY.half - 62, maxZ: -CITY.half - 14 });
  const crateMat = new THREE.MeshLambertMaterial({ color: 0x9c7a3c });
  for (let i = 0; i < 8; i++) {
    const crate = new THREE.Mesh(boxGeo, crateMat);
    const s = rng.range(1.6, 2.6);
    crate.scale.set(s, s, s);
    crate.position.set(-158 + rng.range(0, 16), s / 2, -CITY.half - 20 - rng.range(0, 34));
    crate.rotation.y = rng.range(0, Math.PI);
    group.add(crate);
  }

  // Street lamps along the roads. Lamps stand on the sidewalk beside a
  // north-south road — never in the middle of an east-west road, where a
  // lamp post would block the lane (and the camera) outright.
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x30343a });
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  for (const r of ROAD_AT) {
    for (let t = -CITY.half + 20; t < CITY.half; t += 55) {
      if (ROAD_AT.some((rr) => Math.abs(t - rr) < 8)) continue; // t is on a road
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 7, 6), poleMat);
      pole.position.set(r + ROAD_HALF + 1.2, 3.5, t);
      group.add(pole);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 6), lampMat);
      lamp.position.set(r + ROAD_HALF + 1.2, 7.1, t);
      group.add(lamp);
    }
  }

  // Palm trees on the plazas and along the strip.
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6b4a2a });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x2e7d4f });
  function palm(x, z) {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.35, 6, 6), trunkMat);
    trunk.position.set(x, 3, z);
    group.add(trunk);
    for (let i = 0; i < 5; i++) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.9, 3.2, 4), leafMat);
      const a = (i / 5) * Math.PI * 2;
      leaf.position.set(x + Math.cos(a) * 1.1, 6.4, z + Math.sin(a) * 1.1);
      leaf.rotation.z = Math.cos(a) * 1.1;
      leaf.rotation.x = -Math.sin(a) * 1.1;
      group.add(leaf);
    }
  }
  // Round-2 polish: a few more palms so the strip reads lusher from the road.
  for (let i = 0; i < 30; i++) {
    palm(rng.range(-CITY.half, CITY.half), rng.range(-CITY.half, CITY.half));
  }

  return { group, colliders, landmarks, rng };
}

// Circle-vs-AABB collision resolve: push a circle of radius r out of buildings.
export function resolveCollisions(x, z, r, colliders) {
  let nx = x;
  let nz = z;
  for (const c of colliders) {
    const cx = Math.max(c.minX, Math.min(nx, c.maxX));
    const cz = Math.max(c.minZ, Math.min(nz, c.maxZ));
    const dx = nx - cx;
    const dz = nz - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        nx = cx + (dx / d) * r;
        nz = cz + (dz / d) * r;
      } else {
        // center inside the box: push out along the smallest penetration axis
        const pl = nx - c.minX;
        const pr = c.maxX - nx;
        const pt = nz - c.minZ;
        const pb = c.maxZ - nz;
        const m = Math.min(pl, pr, pt, pb);
        if (m === pl) nx = c.minX - r;
        else if (m === pr) nx = c.maxX + r;
        else if (m === pt) nz = c.minZ - r;
        else nz = c.maxZ + r;
      }
    }
  }
  return [nx, nz];
}
