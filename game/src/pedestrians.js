// Pedestrians — sidewalk walkers with a simple flee response. When gunfire or a
// crash happens nearby they run; a car that hits one at speed knocks them down.

import * as THREE from 'three';
import { makeRng, STREET_AT, resolveCollision } from './city.js';

const SHIRT_COLORS = [0xe74c3c, 0x3498db, 0x2ecc71, 0xf39c12, 0x9b59b6, 0x1abc9c, 0xe67e22, 0xecf0f1, 0x34495e, 0xfd79a8];

function buildWalker(rng) {
  const g = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({ color: SHIRT_COLORS[Math.floor(rng() * SHIRT_COLORS.length)] });
  const skin = new THREE.MeshLambertMaterial({ color: [0xd9a077, 0xb87a52, 0x8a5a34, 0xf0c8a0][Math.floor(rng() * 4)] });
  const pants = new THREE.MeshLambertMaterial({ color: [0x2a3140, 0x4a3a2a, 0x3a4a5a][Math.floor(rng() * 3)] });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.9, 0.4), shirt);
  torso.position.y = 1.05;
  torso.castShadow = true;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.45, 0.45), skin);
  head.position.y = 1.75;
  head.castShadow = true;
  g.add(head);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.8, 0.26), pants);
  legL.position.set(-0.18, 0.4, 0);
  g.add(legL);
  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.8, 0.26), pants);
  legR.position.set(0.18, 0.4, 0);
  g.add(legR);
  g.userData.legs = [legL, legR];
  return g;
}

export function createPedestrians(scene, colliders) {
  const rng = makeRng(4242);
  const walkers = [];

  function sidewalkSpot() {
    // stand just off a street, on the pavement edge
    const s = STREET_AT[Math.floor(rng() * STREET_AT.length)];
    const along = -140 + rng() * 280;
    if (rng() > 0.5) return { x: s + (rng() > 0.5 ? 7.5 : -7.5), z: along };
    return { x: along, z: s + (rng() > 0.5 ? 7.5 : -7.5) };
  }

  for (let i = 0; i < 26; i++) {
    const spot = sidewalkSpot();
    const mesh = buildWalker(rng);
    mesh.position.set(spot.x, 0, spot.z);
    scene.add(mesh);
    walkers.push({
      mesh,
      heading: rng() * Math.PI * 2,
      speed: 1.2 + rng() * 1.1,
      phase: rng() * 6,
      fleeing: false,
      down: false,
      downTimer: 0,
      wanderTimer: 1 + rng() * 3,
    });
  }

  // Called when something violent happens at (x, z): nearby walkers flee.
  function scare(x, z, radius) {
    for (const w of walkers) {
      if (w.down) continue;
      const d = Math.hypot(w.mesh.position.x - x, w.mesh.position.z - z);
      if (d < radius) {
        w.fleeing = true;
        w.heading = Math.atan2(w.mesh.position.x - x, w.mesh.position.z - z);
      }
    }
  }

  function update(dt, danger) {
    for (const w of walkers) {
      if (w.down) {
        w.downTimer -= dt;
        if (w.downTimer <= 0) {
          w.down = false;
          w.mesh.rotation.x = 0;
          w.mesh.position.y = 0;
        }
        continue;
      }
      const speed = w.fleeing ? 6.5 : w.speed;
      w.wanderTimer -= dt;
      if (!w.fleeing && w.wanderTimer <= 0) {
        w.heading += (rng() - 0.5) * 2.2;
        w.wanderTimer = 2 + rng() * 4;
      }
      if (w.fleeing && Math.hypot(w.mesh.position.x - danger.x, w.mesh.position.z - danger.z) > 60) {
        w.fleeing = false;
      }
      let nx = w.mesh.position.x + Math.sin(w.heading) * speed * dt;
      let nz = w.mesh.position.z + Math.cos(w.heading) * speed * dt;
      nx = Math.max(-165, Math.min(165, nx));
      nz = Math.max(-165, Math.min(165, nz));
      const fixed = resolveCollision(colliders, nx, nz, 0.5);
      if (fixed.x !== nx || fixed.z !== nz) w.heading += Math.PI / 2;
      w.mesh.position.x = fixed.x;
      w.mesh.position.z = fixed.z;
      w.mesh.rotation.y = w.heading;
      w.phase += dt * (w.fleeing ? 14 : 7);
      const sw = Math.sin(w.phase) * 0.55;
      w.mesh.userData.legs[0].rotation.x = sw;
      w.mesh.userData.legs[1].rotation.x = -sw;
    }
  }

  // A fast car hitting a walker knocks them down. Returns true if someone fell.
  function hitByCar(carPos, carSpeed) {
    if (Math.abs(carSpeed) < 6) return false;
    for (const w of walkers) {
      if (w.down) continue;
      const d = Math.hypot(w.mesh.position.x - carPos.x, w.mesh.position.z - carPos.z);
      if (d < 2.2) {
        w.down = true;
        w.downTimer = 6;
        w.mesh.rotation.x = -Math.PI / 2;
        w.mesh.position.y = 0.4;
        scare(carPos.x, carPos.z, 40);
        return true;
      }
    }
    return false;
  }

  return { walkers, update, scare, hitByCar };
}
