// Traffic — civilian cars cruising the road graph. Each car picks a route of
// intersections, drives street to street, and slows before turning.

import { CAR_TYPES } from './vehicles.js';
import { makeRng } from './city.js';

const CIVILIAN_TYPES = ['sedan', 'coupe', 'suv', 'truck', 'sports', 'taxi'];
const CRUISE_SPEED = 13;

function neighborsOf(edges, id) {
  const out = [];
  for (const [a, b] of edges) {
    if (a === id) out.push(b);
    else if (b === id) out.push(a);
  }
  return out;
}

export function createTraffic(scene, factory, roadNodes, roadEdges, colliders) {
  const rng = makeRng(777);
  const cars = [];

  function spawnCar() {
    const node = roadNodes[Math.floor(rng() * roadNodes.length)];
    const type = CIVILIAN_TYPES[Math.floor(rng() * CIVILIAN_TYPES.length)];
    const car = factory.spawn(type, node.x + (rng() - 0.5) * 4, node.z + (rng() - 0.5) * 4, rng() * Math.PI * 2);
    const next = neighborsOf(roadEdges, node.id);
    car.ai = {
      target: next[Math.floor(rng() * next.length)],
      wait: 0,
      lane: rng() > 0.5 ? 2.2 : -2.2,
    };
    cars.push(car);
    return car;
  }

  for (let i = 0; i < 14; i++) spawnCar();

  function update(dt, playerCar) {
    for (const car of cars) {
      if (!car.alive) continue;
      const ai = car.ai;
      const target = roadNodes[ai.target];
      if (!target) continue;
      // lane offset: drive on the right side of the road
      const dx = target.x - car.pos.x;
      const dz = target.z - car.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 4) {
        // reached the intersection: pick the next leg (avoid U-turns when possible)
        const opts = neighborsOf(roadEdges, ai.target);
        ai.target = opts[Math.floor(rng() * opts.length)];
        ai.wait = 0.4 + rng() * 0.6; // pause at the intersection
        continue;
      }
      if (ai.wait > 0) {
        ai.wait -= dt;
        car.drive(dt, -0.4, 0, false, colliders);
        continue;
      }
      // steer toward the target node
      const wantHeading = Math.atan2(dx, dz);
      let diff = wantHeading - car.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const steer = Math.max(-1, Math.min(1, diff * 2.2));
      const slow = dist < 14 ? 0.35 : 1;
      const throttle = car.speed < CRUISE_SPEED * slow ? 0.7 : 0;
      // don't rear-end the player's car
      let blocked = false;
      if (playerCar) {
        const pd = Math.hypot(playerCar.pos.x - car.pos.x, playerCar.pos.z - car.pos.z);
        if (pd < 7) blocked = true;
      }
      car.drive(dt, blocked ? -0.6 : throttle, steer, false, colliders);
    }
  }

  function parkedCars() {
    // cars the player can steal: the traffic fleet itself
    return cars;
  }

  return { cars, update, parkedCars };
}
