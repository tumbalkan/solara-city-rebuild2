// Solara PD — the wanted system. Crimes raise stars; hiding drops them. Police
// interceptors spawn at the city edge, chase the player, and ram to stop them.

import { makeRng } from './city.js';

const MAX_COPS = 6;

export function createPolice(scene, factory, roadNodes, colliders) {
  const rng = makeRng(99);
  const cruisers = [];
  let stars = 0;
  let hiddenTimer = 0;
  let spawnTimer = 0;

  function wantedCount() {
    return stars === 0 ? 0 : Math.min(MAX_COPS, 1 + stars);
  }

  function spawnCruiser(nearX, nearZ) {
    // spawn on a road some distance from the player
    const edge = roadNodes[Math.floor(rng() * roadNodes.length)];
    const car = factory.spawn('police', edge.x, edge.z, rng() * Math.PI * 2);
    car.police = true;
    cruisers.push(car);
    return car;
  }

  function raise(amount, reason) {
    const before = stars;
    stars = Math.max(0, Math.min(5, stars + amount));
    hiddenTimer = 0;
    return { before, after: stars, reason };
  }

  function clear() {
    stars = 0;
    hiddenTimer = 0;
    for (const c of cruisers) c.destroy(scene);
    cruisers.length = 0;
  }

  function update(dt, targetPos, targetSpeed, playerHidden) {
    // decay: stars fall when the player stays out of sight
    if (stars > 0) {
      const nearest = nearestCopDist(targetPos);
      const seen = nearest < 45 || !playerHidden;
      if (!seen) {
        hiddenTimer += dt;
        if (hiddenTimer > 9) {
          stars = Math.max(0, stars - 1);
          hiddenTimer = 0;
        }
      } else {
        hiddenTimer = 0;
      }
    }

    // keep the right number of cruisers on the street
    spawnTimer -= dt;
    if (cruisers.length < wantedCount() && spawnTimer <= 0) {
      spawnCruiser(targetPos.x, targetPos.z);
      spawnTimer = 1.2;
    }
    while (cruisers.length > wantedCount()) {
      const c = cruisers.pop();
      c.destroy(scene);
    }

    // chase: steer at the player, ram at close range
    for (const cop of cruisers) {
      if (!cop.alive) continue;
      const dx = targetPos.x - cop.pos.x;
      const dz = targetPos.z - cop.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 260) {
        // too far away: respawn closer
        const edge = roadNodes[Math.floor(rng() * roadNodes.length)];
        cop.pos.x = edge.x; cop.pos.z = edge.z;
        continue;
      }
      const wantHeading = Math.atan2(dx, dz);
      let diff = wantHeading - cop.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const steer = Math.max(-1, Math.min(1, diff * 2.5));
      const throttle = dist > 6 ? 1 : 0.4;
      cop.drive(dt, throttle, steer, false, colliders);
      // ramming contact: push the player's car / hurt the player on foot
      if (dist < 3.4) cop.ramming = true;
      else cop.ramming = false;
    }
    return { stars };
  }

  function nearestCopDist(pos) {
    let best = Infinity;
    for (const c of cruisers) {
      const d = Math.hypot(c.pos.x - pos.x, c.pos.z - pos.z);
      if (d < best) best = d;
    }
    return best;
  }

  function anyRamming() {
    return cruisers.some((c) => c.ramming);
  }

  // Move the farthest cruiser to a point (used to stage the chase screenshot).
  function placeNear(x, z, heading) {
    if (cruisers.length === 0) return;
    let far = cruisers[0];
    let best = -1;
    for (const c of cruisers) {
      const d = Math.hypot(c.pos.x - x, c.pos.z - z);
      if (d > best) { best = d; far = c; }
    }
    far.pos.x = x;
    far.pos.z = z;
    far.heading = heading;
    far.speed = 10;
  }

  return {
    get stars() { return stars; },
    cruisers,
    update, raise, clear, nearestCopDist, anyRamming, placeNear,
  };
}
