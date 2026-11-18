// Solara City — procedural coastal city: street grid, buildings, beach, bay, pier.
// Everything is generated from a fixed seed so every run builds the same city.

import * as THREE from 'three';

// Deterministic PRNG (mulberry32) — same city every load.
export function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const STREET_AT = [-120, -80, -40, 0, 40, 80, 120];
export const ROAD_HALF = 5;
export const CITY_EDGE = 150;
export const BEACH_Z = 148;
export const WATER_Z = 168;

const BUILDING_COLORS = [0xe8dcc8, 0xd9c9a8, 0xc9b8a3, 0xb8c4c9, 0xd8a08a, 0xa8b89a, 0xe0d0b0, 0xc4a882, 0x9fb4c0, 0xd9b8c4];
const ROOF_COLORS = [0x8a6f5c, 0x6f7f8a, 0x9a8a7a, 0x7a6a8a, 0x5c7a6f];

function box(w, h, d, color, x, y, z, parent) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color }));
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

// A window strip texture drawn on a canvas — no image assets needed.
function windowTexture(rng) {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#d8cfc0';
  g.fillRect(0, 0, 64, 128);
  for (let y = 8; y < 120; y += 16) {
    for (let x = 6; x < 58; x += 14) {
      g.fillStyle = rng() > 0.5 ? '#2b3d55' : '#5a7ba6';
      g.fillRect(x, y, 9, 10);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildCity(scene) {
  const rng = makeRng(20261118);
  const group = new THREE.Group();
  scene.add(group);

  const colliders = []; // {minX,maxX,minZ,maxZ}
  const roadNodes = []; // {x, z, id}
  const roadEdges = []; // [idA, idB]
  const nodeId = new Map();

  // --- Ground ---
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(760, 760),
    new THREE.MeshLambertMaterial({ color: 0x3f7a4a })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.05, 0);
  ground.receiveShadow = true;
  group.add(ground);

  // City pavement slab
  const slab = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY_EDGE * 2 + 20, CITY_EDGE * 2 + 20),
    new THREE.MeshLambertMaterial({ color: 0x8f8a80 })
  );
  slab.rotation.x = -Math.PI / 2;
  slab.position.set(0, 0, 0);
  slab.receiveShadow = true;
  group.add(slab);

  // --- Roads (dark strips + center dashes) ---
  const roadMat = new THREE.MeshLambertMaterial({ color: 0x2e3138 });
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xf5d76e });
  for (const s of STREET_AT) {
    const hRoad = new THREE.Mesh(new THREE.PlaneGeometry(CITY_EDGE * 2 + 20, ROAD_HALF * 2), roadMat);
    hRoad.rotation.x = -Math.PI / 2;
    hRoad.position.set(0, 0.02, s);
    hRoad.receiveShadow = true;
    group.add(hRoad);
    const vRoad = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HALF * 2, CITY_EDGE * 2 + 20), roadMat);
    vRoad.rotation.x = -Math.PI / 2;
    vRoad.position.set(s, 0.02, 0);
    vRoad.receiveShadow = true;
    group.add(vRoad);
    // dashes along each road
    for (let d = -140; d <= 140; d += 16) {
      const dh = new THREE.Mesh(new THREE.PlaneGeometry(4, 0.5), dashMat);
      dh.rotation.x = -Math.PI / 2;
      dh.position.set(d, 0.04, s);
      group.add(dh);
      const dv = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 4), dashMat);
      dv.rotation.x = -Math.PI / 2;
      dv.position.set(s, 0.04, d);
      group.add(dv);
    }
  }

  // --- Road graph: intersections + edges ---
  for (const x of STREET_AT) {
    for (const z of STREET_AT) {
      const id = roadNodes.length;
      nodeId.set(x + ',' + z, id);
      roadNodes.push({ x, z, id });
    }
  }
  for (let i = 0; i < STREET_AT.length; i++) {
    for (let j = 0; j < STREET_AT.length; j++) {
      const a = nodeId.get(STREET_AT[i] + ',' + STREET_AT[j]);
      if (i + 1 < STREET_AT.length) roadEdges.push([a, nodeId.get(STREET_AT[i + 1] + ',' + STREET_AT[j])]);
      if (j + 1 < STREET_AT.length) roadEdges.push([a, nodeId.get(STREET_AT[i] + ',' + STREET_AT[j + 1])]);
    }
  }

  // --- Buildings: one or two per block, ~70 total ---
  const winTex = windowTexture(rng);
  let buildingCount = 0;
  for (let i = 0; i < STREET_AT.length - 1; i++) {
    for (let j = 0; j < STREET_AT.length - 1; j++) {
      const cx = (STREET_AT[i] + STREET_AT[i + 1]) / 2;
      const cz = (STREET_AT[j] + STREET_AT[j + 1]) / 2;
      // skip the central plaza block (spawn area) and the beach row
      if (cx === 0 && cz === 0) continue;
      if (cz > 100) continue;
      const roll = rng();
      const tower = roll > 0.82;
      if (tower) {
        const w = 16 + rng() * 8, d = 16 + rng() * 8, h = 34 + rng() * 26;
        const mat = new THREE.MeshLambertMaterial({ color: BUILDING_COLORS[(i * 7 + j) % BUILDING_COLORS.length], map: winTex });
        const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        b.position.set(cx, h / 2, cz);
        b.castShadow = true; b.receiveShadow = true;
        group.add(b);
        box(w + 1.5, 1.2, d + 1.5, ROOF_COLORS[(i + j) % ROOF_COLORS.length], cx, h + 0.6, cz, group);
        colliders.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 });
        buildingCount++;
      } else {
        const n = roll > 0.45 ? 2 : 1;
        for (let k = 0; k < n; k++) {
          const ox = n === 2 ? (k === 0 ? -8 : 8) : 0;
          const w = 11 + rng() * 6, d = 11 + rng() * 6, h = 7 + rng() * 12;
          const mat = new THREE.MeshLambertMaterial({ color: BUILDING_COLORS[Math.floor(rng() * BUILDING_COLORS.length)] });
          const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
          b.position.set(cx + ox, h / 2, cz);
          b.castShadow = true; b.receiveShadow = true;
          group.add(b);
          // rooftop box detail
          box(3 + rng() * 3, 1.6, 3 + rng() * 3, ROOF_COLORS[Math.floor(rng() * ROOF_COLORS.length)], cx + ox, h + 0.8, cz, group);
          colliders.push({ minX: cx + ox - w / 2, maxX: cx + ox + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 });
          buildingCount++;
        }
      }
    }
  }

  // --- Central plaza (spawn): fountain ring + benches ---
  const fountain = new THREE.Mesh(new THREE.CylinderGeometry(7, 8, 1.2, 24), new THREE.MeshLambertMaterial({ color: 0x9aa5ad }));
  fountain.position.set(0, 0.6, 0);
  fountain.castShadow = true;
  group.add(fountain);
  const fountainWater = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 0.4, 24), new THREE.MeshLambertMaterial({ color: 0x3fa7c4 }));
  fountainWater.position.set(0, 1.3, 0);
  group.add(fountainWater);
  colliders.push({ minX: -8, maxX: 8, minZ: -8, maxZ: 8 });

  // --- Palm trees along the beach road and plaza ---
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x7a5a3a });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x2e8b57 });
  function palm(x, z) {
    const t = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.55, 7, 6), trunkMat);
    trunk.position.y = 3.5;
    trunk.castShadow = true;
    t.add(trunk);
    for (let i = 0; i < 6; i++) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.9, 5.5, 4), leafMat);
      const a = (i / 6) * Math.PI * 2;
      leaf.position.set(Math.cos(a) * 1.6, 7.6, Math.sin(a) * 1.6);
      leaf.rotation.set(Math.sin(a) * 0.9, 0, Math.cos(a) * 0.9 + Math.PI);
      leaf.castShadow = true;
      t.add(leaf);
    }
    t.position.set(x, 0, z);
    group.add(t);
  }
  for (let x = -140; x <= 140; x += 20) palm(x + rng() * 4, 132 + rng() * 3);
  for (let i = 0; i < 10; i++) palm(-14 + rng() * 28, -14 + rng() * 28 > 0 ? 14 + rng() * 6 : -14 - rng() * 6);

  // --- Streetlights at intersections ---
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x3a3f46 });
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  for (const n of roadNodes) {
    if ((n.x + n.z) % 80 !== 0) continue;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.25, 7, 6), poleMat);
    pole.position.set(n.x + 6, 3.5, n.z + 6);
    group.add(pole);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 8), lampMat);
    lamp.position.set(n.x + 6, 7.2, n.z + 6);
    group.add(lamp);
  }

  // --- Beach, bay, pier ---
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(760, 40), new THREE.MeshLambertMaterial({ color: 0xe8d8a8 }));
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0.01, BEACH_Z + 12);
  sand.receiveShadow = true;
  group.add(sand);

  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(760, 220),
    new THREE.MeshLambertMaterial({ color: 0x1e7fa8, transparent: true, opacity: 0.9 })
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, 0.05, WATER_Z + 100);
  group.add(water);

  // Pier: wooden deck from the beach into the bay
  const deckMat = new THREE.MeshLambertMaterial({ color: 0x8a6a4a });
  for (let z = 156; z <= 210; z += 6) {
    const plank = new THREE.Mesh(new THREE.BoxGeometry(10, 0.8, 6), deckMat);
    plank.position.set(0, 1.2, z);
    plank.castShadow = true; plank.receiveShadow = true;
    group.add(plank);
  }
  for (const px of [-4.5, 4.5]) {
    for (let z = 156; z <= 210; z += 12) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 3, 6), deckMat);
      post.position.set(px, 0, z);
      group.add(post);
    }
  }
  // Pier end platform + hut
  const platform = new THREE.Mesh(new THREE.BoxGeometry(18, 1, 14), deckMat);
  platform.position.set(0, 1.2, 216);
  platform.castShadow = true;
  group.add(platform);
  box(6, 4, 5, 0xd9c9a8, -4, 3.6, 216, group);
  box(7, 0.8, 6, 0x8a3a3a, -4, 5.9, 216, group);

  // --- Sun + sky ---
  const sun = new THREE.DirectionalLight(0xfff2d8, 2.4);
  sun.position.set(120, 180, 60);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -180; sun.shadow.camera.right = 180;
  sun.shadow.camera.top = 180; sun.shadow.camera.bottom = -180;
  sun.shadow.camera.far = 500;
  scene.add(sun);
  scene.add(new THREE.AmbientLight(0xbcd8ff, 0.9));
  scene.add(new THREE.HemisphereLight(0x9fd4ff, 0x8a7a5a, 0.7));
  scene.background = new THREE.Color(0x87bfe8);
  scene.fog = new THREE.Fog(0x87bfe8, 320, 640);

  return {
    group, colliders, roadNodes, roadEdges, buildingCount,
    spawn: { x: 0, z: 22 },
    pierEnd: { x: 0, z: 216 },
    maraSpot: { x: -20, z: 100 },
  };
}

// Point-vs-AABB test used by player, cars and pedestrians.
export function hitsCollider(colliders, x, z, radius) {
  for (const c of colliders) {
    if (x + radius > c.minX && x - radius < c.maxX && z + radius > c.minZ && z - radius < c.maxZ) return c;
  }
  return null;
}

// Push a circle out of a collider — returns corrected x,z.
export function resolveCollision(colliders, x, z, radius) {
  const c = hitsCollider(colliders, x, z, radius);
  if (!c) return { x, z };
  const dxl = x + radius - c.minX, dxr = c.maxX - (x - radius);
  const dzl = z + radius - c.minZ, dzr = c.maxZ - (z - radius);
  const m = Math.min(dxl, dxr, dzl, dzr);
  if (m === dxl) x = c.minX - radius;
  else if (m === dxr) x = c.maxX + radius;
  else if (m === dzl) z = c.minZ - radius;
  else z = c.maxZ + radius;
  return { x, z };
}
