// Vehicles — box-built cars with arcade handling. Six civilian types plus the
// Solara PD interceptor. One Car class drives them all; handling numbers differ.

import * as THREE from 'three';
import { resolveCollision } from './city.js';

export const CAR_TYPES = {
  sedan:   { color: 0xc0392b, topSpeed: 34, accel: 16, grip: 2.4, name: 'Sedano' },
  coupe:   { color: 0x2980b9, topSpeed: 40, accel: 20, grip: 2.8, name: 'Coupé' },
  suv:     { color: 0x7f8c8d, topSpeed: 30, accel: 13, grip: 2.1, name: 'Trailux' },
  truck:   { color: 0x8e6e3a, topSpeed: 27, accel: 11, grip: 1.9, name: 'Hauler' },
  sports:  { color: 0xf1c40f, topSpeed: 48, accel: 26, grip: 3.1, name: 'Falcon GT' },
  taxi:    { color: 0xf5d76e, topSpeed: 33, accel: 15, grip: 2.4, name: 'Cab' },
  police:  { color: 0x1a1d24, topSpeed: 44, accel: 24, grip: 3.0, name: 'Interceptor' },
};

function buildCarMesh(type, spec) {
  const g = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color: spec.color });
  const glass = new THREE.MeshLambertMaterial({ color: 0x9fd8e8 });
  const dark = new THREE.MeshLambertMaterial({ color: 0x15181d });

  const long = type === 'truck' ? 5.4 : 4.4;
  const wide = type === 'suv' || type === 'truck' ? 2.2 : 1.9;
  const bodyH = type === 'suv' || type === 'truck' ? 1.15 : 0.8;

  const body = new THREE.Mesh(new THREE.BoxGeometry(wide, bodyH, long), paint);
  body.position.y = 0.65;
  body.castShadow = true;
  g.add(body);

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(wide * 0.82, 0.65, long * 0.45), glass);
  cabin.position.set(0, 1.3, type === 'truck' ? 1.2 : -0.2);
  cabin.castShadow = true;
  g.add(cabin);

  const roof = new THREE.Mesh(new THREE.BoxGeometry(wide * 0.86, 0.12, long * 0.48), paint);
  roof.position.set(0, 1.66, type === 'truck' ? 1.2 : -0.2);
  g.add(roof);

  // wheels
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 12);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheels = [];
  for (const [wx, wz] of [[-wide / 2, long / 2 - 0.8], [wide / 2, long / 2 - 0.8], [-wide / 2, -long / 2 + 0.8], [wide / 2, -long / 2 + 0.8]]) {
    const w = new THREE.Mesh(wheelGeo, dark);
    w.position.set(wx, 0.38, wz);
    w.castShadow = true;
    g.add(w);
    wheels.push(w);
  }

  // headlights + taillights
  const hl = new THREE.MeshBasicMaterial({ color: 0xfff6c9 });
  const tl = new THREE.MeshBasicMaterial({ color: 0xff4444 });
  for (const hx of [-wide / 2 + 0.3, wide / 2 - 0.3]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.22, 0.1), hl);
    h.position.set(hx, 0.7, long / 2 + 0.02);
    g.add(h);
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.22, 0.1), tl);
    t.position.set(hx, 0.7, -long / 2 - 0.02);
    g.add(t);
  }

  if (type === 'police') {
    // white doors stripe + light bar
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(wide + 0.04, 0.5, long * 0.5), new THREE.MeshLambertMaterial({ color: 0xf2f4f8 }));
    stripe.position.set(0, 0.62, 0);
    g.add(stripe);
    const bar = new THREE.Group();
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 0.3), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    red.position.x = -0.35;
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 0.3), new THREE.MeshBasicMaterial({ color: 0x2266ff }));
    blue.position.x = 0.35;
    bar.add(red); bar.add(blue);
    bar.position.set(0, 1.85, -0.2);
    g.add(bar);
    g.userData.lightBar = bar;
  }
  if (type === 'taxi') {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.25, 0.4), new THREE.MeshBasicMaterial({ color: 0xfff200 }));
    sign.position.set(0, 1.8, -0.2);
    g.add(sign);
  }
  g.userData.wheels = wheels;
  return g;
}

export class Car {
  constructor(scene, type, x, z, heading) {
    this.type = type;
    this.spec = CAR_TYPES[type];
    this.mesh = buildCarMesh(type, this.spec);
    this.mesh.position.set(x, 0, z);
    this.mesh.rotation.y = heading;
    scene.add(this.mesh);
    this.heading = heading;
    this.speed = 0;
    this.steer = 0;
    this.driven = false; // true when the player drives it
    this.ai = null; // traffic AI state, set by traffic.js
    this.police = false; // chase AI flag, set by police.js
    this.alive = true;
    this.smoke = 0; // damage smoke 0..1
    this.flash = 0; // light bar strobe timer
  }

  get pos() { return this.mesh.position; }

  // Arcade physics: throttle/brake/steer inputs in [-1, 1].
  drive(dt, throttle, steerInput, handbrake, colliders) {
    const s = this.spec;
    if (throttle > 0) this.speed += s.accel * throttle * dt;
    else if (throttle < 0) {
      if (this.speed > 0.5) this.speed += s.accel * 1.6 * throttle * dt;
      else this.speed = Math.max(-12, this.speed + s.accel * 0.6 * throttle * dt);
    } else {
      this.speed -= this.speed * 0.6 * dt;
    }
    if (handbrake) this.speed -= this.speed * 1.8 * dt;
    this.speed = Math.max(-12, Math.min(s.topSpeed, this.speed));

    const grip = handbrake ? s.grip * 0.45 : s.grip;
    const turnRate = grip * Math.min(1, Math.abs(this.speed) / 8) * (this.speed < 0 ? -1 : 1);
    this.steer += (steerInput - this.steer) * Math.min(1, dt * 8);
    this.heading += this.steer * turnRate * dt;

    const dx = Math.sin(this.heading) * this.speed * dt;
    const dz = Math.cos(this.heading) * this.speed * dt;
    let nx = this.pos.x + dx;
    let nz = this.pos.z + dz;
    nx = Math.max(-170, Math.min(170, nx));
    nz = Math.max(-170, Math.min(222, nz));
    const before = { x: nx, z: nz };
    const fixed = resolveCollision(colliders, nx, nz, 1.6);
    if (fixed.x !== before.x || fixed.z !== before.z) {
      // hit a wall: lose speed, bounce a little
      this.speed *= -0.25;
    }
    this.pos.x = fixed.x;
    this.pos.z = fixed.z;
    this.mesh.rotation.y = this.heading;
    const spin = (this.speed / 0.38) * dt;
    for (const w of this.mesh.userData.wheels) w.rotation.x += spin;
    // front wheels visually steer
    this.mesh.userData.wheels[0].rotation.y = this.steer * 0.4;
    this.mesh.userData.wheels[1].rotation.y = this.steer * 0.4;

    if (this.type === 'police' && this.mesh.userData.lightBar) {
      this.flash += dt * 10;
      const on = Math.sin(this.flash) > 0;
      this.mesh.userData.lightBar.children[0].visible = on;
      this.mesh.userData.lightBar.children[1].visible = !on;
    }
  }

  destroy(scene) {
    this.alive = false;
    scene.remove(this.mesh);
  }
}

export function createVehicleFactory(scene) {
  return {
    spawn(type, x, z, heading) {
      return new Car(scene, type, x, z, heading);
    },
  };
}
