// Rico Vega — third-person on-foot character. Box-built low-poly figure with a
// simple walk cycle, sprint, and car enter/exit.

import * as THREE from 'three';
import { resolveCollision } from './city.js';

const WALK_SPEED = 6;
const SPRINT_SPEED = 11;

function limb(w, h, d, color) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color }));
  m.castShadow = true;
  return m;
}

export function createPlayer(scene, startX, startZ) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  // Torso, head, arms, legs — Rico wears a teal jacket and dark jeans.
  const torso = limb(0.9, 1.1, 0.5, 0x1f8a8a);
  torso.position.y = 1.15;
  body.add(torso);
  const head = limb(0.55, 0.55, 0.55, 0xd9a077);
  head.position.y = 2.0;
  body.add(head);
  const cap = limb(0.6, 0.18, 0.6, 0x223344);
  cap.position.y = 2.32;
  body.add(cap);
  const armL = limb(0.28, 1.0, 0.28, 0x1f8a8a);
  armL.position.set(-0.62, 1.2, 0);
  body.add(armL);
  const armR = limb(0.28, 1.0, 0.28, 0x1f8a8a);
  armR.position.set(0.62, 1.2, 0);
  body.add(armR);
  const legL = limb(0.34, 0.95, 0.34, 0x2a3140);
  legL.position.set(-0.24, 0.48, 0);
  body.add(legL);
  const legR = limb(0.34, 0.95, 0.34, 0x2a3140);
  legR.position.set(0.24, 0.48, 0);
  body.add(legR);

  root.position.set(startX, 0, startZ);
  scene.add(root);

  const state = {
    root, body, armL, armR, legL, legR,
    heading: Math.PI, // faces the plaza
    health: 100,
    maxHealth: 100,
    cash: 0,
    inCar: null,
    walkPhase: 0,
    moving: false,
    dead: false,
    speedNow: 0,
  };

  function update(dt, input, colliders, camYaw) {
    if (state.dead || state.inCar) {
      state.moving = false;
      state.speedNow = 0;
      return;
    }
    let fx = 0, fz = 0;
    if (input.forward) { fx += -Math.sin(camYaw); fz += -Math.cos(camYaw); }
    if (input.back) { fx += Math.sin(camYaw); fz += Math.cos(camYaw); }
    if (input.left) { fx += -Math.cos(camYaw); fz += Math.sin(camYaw); }
    if (input.right) { fx += Math.cos(camYaw); fz += -Math.sin(camYaw); }
    const len = Math.hypot(fx, fz);
    state.moving = len > 0.01;
    if (state.moving) {
      fx /= len; fz /= len;
      const sprinting = input.sprint;
      const speed = sprinting ? SPRINT_SPEED : WALK_SPEED;
      state.speedNow = speed;
      let nx = root.position.x + fx * speed * dt;
      let nz = root.position.z + fz * speed * dt;
      // keep Rico inside the playable area (city + beach + pier deck)
      nx = Math.max(-170, Math.min(170, nx));
      nz = Math.max(-170, Math.min(222, nz));
      const fixed = resolveCollision(colliders, nx, nz, 0.7);
      root.position.x = fixed.x;
      root.position.z = fixed.z;
      state.heading = Math.atan2(fx, fz);
      state.walkPhase += dt * (sprinting ? 13 : 9);
      const swing = Math.sin(state.walkPhase) * (sprinting ? 0.9 : 0.6);
      state.legL.rotation.x = swing;
      state.legR.rotation.x = -swing;
      state.armL.rotation.x = -swing * 0.8;
      state.armR.rotation.x = swing * 0.8;
    } else {
      state.legL.rotation.x *= 0.8;
      state.legR.rotation.x *= 0.8;
      state.armL.rotation.x *= 0.8;
      state.armR.rotation.x *= 0.8;
    }
    root.rotation.y = state.heading;
    // aim pose: right arm raises when aiming
    if (input.aiming) state.armR.rotation.x = -1.35;
  }

  function damage(amount) {
    if (state.dead) return;
    state.health = Math.max(0, state.health - amount);
    if (state.health <= 0) state.dead = true;
  }

  function heal(amount) {
    state.health = Math.min(state.maxHealth, state.health + amount);
  }

  function revive(x, z) {
    state.health = state.maxHealth;
    state.dead = false;
    root.position.set(x, 0, z);
    root.visible = true;
  }

  return { state, update, damage, heal, revive };
}
