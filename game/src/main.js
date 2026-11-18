// Solara City — main entrypoint. Wires the city, Rico, cars, traffic, police,
// combat, missions, HUD, audio and save into one game loop. Played with
// keyboard + mouse; screenshots run through ?shot=city|drive|chase|mission.

import * as THREE from 'three';
import { buildCity, STREET_AT } from './city.js';
import { createPlayer } from './player.js';
import { createVehicleFactory, CAR_TYPES } from './vehicles.js';
import { createTraffic } from './traffic.js';
import { createPedestrians } from './pedestrians.js';
import { createPolice } from './police.js';
import { createCombat } from './combat.js';
import { createMissions, JOBS } from './missions.js';
import { createHUD } from './hud.js';
import { createAudio } from './audio.js';
import { loadSave, writeSave, freshSave } from './save.js';

const params = new URLSearchParams(location.search);
const SHOT = params.get('shot'); // city | drive | chase | mission | null
const AUTO = SHOT !== null;

// ---------- renderer / scene ----------
const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);

// ---------- world ----------
const city = buildCity(scene);
const factory = createVehicleFactory(scene);
const traffic = createTraffic(scene, factory, city.roadNodes, city.roadEdges, city.colliders);
const peds = createPedestrians(scene, city.colliders);
const police = createPolice(scene, factory, city.roadNodes, city.colliders);
const save = loadSave() || freshSave();

const player = createPlayer(scene, city.spawn.x, city.spawn.z);
player.state.cash = save.cash;

// Parked stealable cars: a sports car at the north lot (job 1 target) + a few around town.
const parked = [];
function parkCar(type, x, z, heading) {
  const car = factory.spawn(type, x, z, heading);
  parked.push(car);
  return car;
}
const falcon = parkCar('sports', 80, -120, Math.PI / 2);
parkCar('sedan', 24, -40, 0);
parkCar('suv', -44, 40, Math.PI);
parkCar('coupe', 44, 84, -Math.PI / 2);
parkCar('taxi', -84, -84, Math.PI / 2);
parkCar('truck', 120, 20, 0);

const combat = createCombat(
  scene,
  city.colliders,
  () => { // enemy down
    hud.showToast('Gang member down — ' + combat.aliveCount() + ' left');
  },
  (origin) => { // shot fired
    audio.shot();
    peds.scare(origin.x, origin.z, 55);
    if (police.stars === 0 && !missions.job?.id === 5) police.raise(1, 'shots fired');
  }
);

const hud = createHUD();
const audio = createAudio();
let gangSpawned = false;
let job4Started = false;

const missions = createMissions(scene, (ev) => {
  if (ev.type === 'start') {
    hud.showFlash('JOB ' + ev.job.id + ': ' + ev.job.name, ev.text);
    if (ev.job.id === 3) police.raise(3, 'heat wave');
    if (ev.job.id === 4) { police.raise(4, 'heist'); job4Started = true; }
    if (ev.job.id === 5 && !gangSpawned) {
      combat.spawnGang(city.pierEnd);
      combat.tagEnemyMeshes();
      gangSpawned = true;
    }
  } else if (ev.type === 'line') {
    hud.showSubtitle(ev.text.who, ev.text.line, 5);
  } else if (ev.type === 'objective') {
    hud.showToast(ev.text);
  } else if (ev.type === 'complete') {
    const j = ev.job;
    player.state.cash += j.pay;
    save.cash = player.state.cash;
    if (!save.jobsDone.includes(j.id)) save.jobsDone.push(j.id);
    writeSave(save);
    audio.chime();
    hud.showFlash('JOB COMPLETE', j.name + ' — +$' + j.pay.toLocaleString('en-US'));
  }
});
// resume from the first unfinished job
{
  const done = new Set(save.jobsDone);
  let next = JOBS.findIndex((j) => !done.has(j.id));
  if (next === -1) next = JOBS.length;
  missions.setCurrent(next >= JOBS.length ? -1 : next);
}

// ---------- input ----------
const input = { forward: false, back: false, left: false, right: false, sprint: false, aiming: false };
let camYaw = Math.PI;
let camPitch = 0.42;
let camDist = 9;
let locked = false;
let playing = false;
let paused = false;

window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyW' || e.code === 'ArrowUp') input.forward = true;
  if (e.code === 'KeyS' || e.code === 'ArrowDown') input.back = true;
  if (e.code === 'KeyA' || e.code === 'ArrowLeft') input.left = true;
  if (e.code === 'KeyD' || e.code === 'ArrowRight') input.right = true;
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') input.sprint = true;
  if (e.code === 'KeyR') { if (combat.reload()) audio.click(); }
  if (e.code === 'KeyF') doMelee();
  if (e.code === 'KeyE') toggleCar();
  if (e.code === 'Escape' && playing) togglePause();
});
window.addEventListener('keyup', (e) => {
  if (e.code === 'KeyW' || e.code === 'ArrowUp') input.forward = false;
  if (e.code === 'KeyS' || e.code === 'ArrowDown') input.back = false;
  if (e.code === 'KeyA' || e.code === 'ArrowLeft') input.left = false;
  if (e.code === 'KeyD' || e.code === 'ArrowRight') input.right = false;
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') input.sprint = false;
});
document.addEventListener('mousemove', (e) => {
  if (!locked || !playing || paused) return;
  camYaw -= e.movementX * 0.0026;
  camPitch = Math.max(0.08, Math.min(1.25, camPitch + e.movementY * 0.0022));
});
document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === canvas;
});
canvas.addEventListener('click', () => {
  if (!playing || paused) return;
  // request the lock for mouse-look, but shoot on the click either way so
  // firing still works where pointer lock is unavailable (headless browsers)
  if (!locked) canvas.requestPointerLock();
  if (!player.state.inCar) doShoot();
});
window.addEventListener('wheel', (e) => {
  camDist = Math.max(5, Math.min(16, camDist + e.deltaY * 0.01));
});
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- actions ----------
function nearestStealable(maxDist) {
  const p = player.state.root.position;
  let best = null, bestD = maxDist;
  for (const car of [...parked, ...traffic.cars]) {
    if (!car.alive || car.driven) continue;
    const d = Math.hypot(car.pos.x - p.x, car.pos.z - p.z);
    if (d < bestD) { best = car; bestD = d; }
  }
  return best;
}

function toggleCar() {
  if (!playing || paused || player.state.dead) return;
  const st = player.state;
  if (st.inCar) {
    const car = st.inCar;
    st.inCar = null;
    car.driven = false;
    st.root.visible = true;
    st.root.position.set(car.pos.x + 2.6, 0, car.pos.z + 1.5);
    audio.click();
    return;
  }
  const car = nearestStealable(4.5);
  if (!car) { hud.showToast('No car nearby'); return; }
  st.inCar = car;
  car.driven = true;
  car.ai = null;
  st.root.visible = false;
  save.carsStolen++;
  writeSave(save);
  audio.click();
  if (police.stars === 0) {
    police.raise(1, 'stolen car');
    hud.showToast('Car stolen — the law noticed');
  }
  hud.setHint('WASD drive · Space handbrake · E exit car · Click shoot (on foot only)');
}

function doShoot() {
  if (!playing || paused || player.state.dead || player.state.inCar) return;
  if (combat.ammo <= 0) { combat.reload(); return; }
  const origin = player.state.root.position.clone().add(new THREE.Vector3(0, 1.5, 0));
  const aimDir = new THREE.Vector3();
  camera.getWorldDirection(aimDir);
  const targets = [...scene.children.filter((o) => o.type === 'Mesh' || o.type === 'Group')];
  combat.shoot(origin, aimDir, targets);
}

function doMelee() {
  if (!playing || paused || player.state.dead || player.state.inCar) return;
  const p = player.state.root.position;
  const hit = combat.melee(p, player.state.heading, []);
  if (hit) { audio.thud(); hud.showToast('Melee hit!'); }
}

function togglePause() {
  paused = !paused;
  document.getElementById('pause-menu').style.display = paused ? 'flex' : 'none';
  if (paused) document.exitPointerLock?.();
  else canvas.requestPointerLock?.();
}

function die() {
  document.getElementById('dead-menu').style.display = 'flex';
  document.exitPointerLock?.();
  const fine = Math.min(player.state.cash, 150);
  player.state.cash -= fine;
  save.cash = player.state.cash;
  writeSave(save);
  document.getElementById('dead-text').textContent =
    `Rico went down. The clinic patched him up — $${fine} for the privilege.`;
}

// ---------- UI buttons ----------
document.getElementById('play-btn').addEventListener('click', () => {
  audio.unlock();
  audio.click();
  audio.startEngine();
  document.getElementById('start-screen').style.display = 'none';
  playing = true;
  canvas.requestPointerLock?.();
  if (save.jobsDone.length > 0) hud.showToast(`Welcome back — ${save.jobsDone.length}/5 jobs done`);
});
document.getElementById('resume-btn').addEventListener('click', togglePause);
document.getElementById('respawn-btn').addEventListener('click', () => {
  document.getElementById('dead-menu').style.display = 'none';
  player.revive(city.spawn.x, city.spawn.z);
  police.clear();
  playing = true;
});
{
  const note = document.getElementById('save-note');
  if (save.jobsDone.length > 0 || save.cash > 0) {
    note.textContent = `Saved progress: $${save.cash.toLocaleString('en-US')} · ${save.jobsDone.length}/5 jobs · ${save.carsStolen} cars stolen`;
  }
}

// ---------- camera ----------
const camTarget = new THREE.Vector3();
function updateCamera(dt) {
  const st = player.state;
  const focus = st.inCar ? st.inCar.pos : st.root.position;
  camTarget.lerp(new THREE.Vector3(focus.x, focus.y + 1.6, focus.z), Math.min(1, dt * 6));
  const back = new THREE.Vector3(Math.sin(camYaw) * Math.cos(camPitch), Math.sin(camPitch), Math.cos(camYaw) * Math.cos(camPitch));
  const want = camTarget.clone().addScaledVector(back, camDist);
  want.y = Math.max(1.2, want.y);
  camera.position.lerp(want, Math.min(1, dt * 8));
  camera.lookAt(camTarget);
}

// ---------- screenshot mode ----------
function setupShot() {
  playing = true;
  document.getElementById('start-screen').style.display = 'none';
  document.getElementById('hint').style.display = 'none';
  audio.unlock();
  if (SHOT === 'city') {
    // establishing shot: Rico on foot near the plaza; fixed high camera
    player.state.root.position.set(0, 0, 30);
  } else if (SHOT === 'drive') {
    const car = falcon;
    player.state.inCar = car;
    car.driven = true;
    car.ai = null;
    player.state.root.visible = false;
    car.pos.set(0, 0, -60);
    car.heading = Math.PI;
    camYaw = Math.PI;
    camPitch = 0.32;
    camDist = 10;
  } else if (SHOT === 'chase') {
    const car = parked[1]; // sedan
    player.state.inCar = car;
    car.driven = true;
    car.ai = null;
    player.state.root.visible = false;
    car.pos.set(-40, 0, -40);
    car.heading = Math.PI / 2;
    police.raise(3, 'shot setup');
    camYaw = Math.PI / 2;
    camPitch = 0.3;
    camDist = 11;
  } else if (SHOT === 'mission') {
    missions.startJob(0);
    // Rico on the x=80 street, looking north toward the Falcon GT at (80,-120)
    player.state.root.position.set(80, 0, -96);
    player.state.heading = Math.PI;
    camYaw = 0;
    camPitch = 0.35;
    camDist = 9;
    // the job flash fades on game-time; hide it early so the shot is clean
    setTimeout(() => {
      document.getElementById('objective-flash').style.display = 'none';
    }, 600);
  }
  window.__shotReady = false;
  setTimeout(() => { window.__shotReady = true; }, 2600);
}

// ---------- main loop ----------
const clock = new THREE.Clock();
let elapsed = 0;
let playSeconds = save.playSeconds || 0;
let autoDriveTimer = 0;
let chaseStaged = false;

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, clock.getDelta());
  elapsed += dt;

  if (playing && !paused) {
    playSeconds += dt;
    if (Math.floor(playSeconds) % 15 === 0 && Math.floor(playSeconds) !== Math.floor(playSeconds - dt)) {
      save.playSeconds = Math.floor(playSeconds);
      writeSave(save);
    }

    const st = player.state;
    const car = st.inCar;

    // player or car movement
    if (car) {
      let throttle = 0, steer = 0;
      if (AUTO && (SHOT === 'drive' || SHOT === 'chase')) {
        // autopilot for screenshots: drive forward, steer along the street
        throttle = 0.85;
        autoDriveTimer += dt;
        const targetYaw = SHOT === 'drive' ? Math.PI : Math.PI / 2;
        let diff = targetYaw - car.heading;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        steer = Math.max(-1, Math.min(1, diff * 1.5));
        if (autoDriveTimer > 2.4) { // gentle S-curve so the shot reads as driving
          steer += Math.sin(autoDriveTimer * 0.9) * 0.25;
        }
      } else {
        if (input.forward) throttle = 1;
        if (input.back) throttle = -1;
        if (input.left) steer = -1;
        if (input.right) steer = 1;
      }
      const handbrake = false; // Space handled via sprint key while driving
      car.drive(dt, throttle, steer, input.sprint && car.speed > 4, city.colliders);
      camYaw = car.heading + Math.PI; // chase cam follows the car
      // car hitting a pedestrian is a crime
      if (peds.hitByCar(car.pos, car.speed)) {
        police.raise(1, 'hit a pedestrian');
        audio.thud();
        hud.showToast('You hit a pedestrian!');
      }
      audio.setEngine(Math.abs(car.speed) / car.spec.topSpeed, true);
    } else {
      player.update(dt, input, city.colliders, camYaw);
      audio.setEngine(0, false);
    }

    // police ramming hurts the player
    if (police.anyRamming()) {
      if (car) {
        car.speed *= 0.94;
      } else if (Math.random() < dt * 2) {
        player.damage(4);
      }
    }

    // systems
    traffic.update(dt, car);
    peds.update(dt, { x: st.root.position.x, z: st.root.position.z });
    const hidden = police.nearestCopDist(st.inCar ? st.inCar.pos : st.root.position) > 55;
    police.update(dt, st.inCar ? st.inCar.pos : st.root.position, car ? car.speed : st.speedNow, hidden);
    if (police.stars > save.bestStars) { save.bestStars = police.stars; writeSave(save); }
    // chase screenshot: once cruisers exist, pull two of them in behind the car
    if (AUTO && SHOT === 'chase' && !chaseStaged && police.cruisers.length >= 2) {
      const cp = car ? car.pos : st.root.position;
      const hd = car ? car.heading : 0;
      police.placeNear(cp.x - Math.sin(hd) * 14, cp.z - Math.cos(hd) * 14, hd);
      police.placeNear(cp.x - Math.sin(hd) * 22 + 3, cp.z - Math.cos(hd) * 22, hd);
      chaseStaged = true;
    }
    audio.setSiren(police.stars > 0);
    combat.update(dt, st.root.position, (dmg) => { player.damage(dmg); });

    // missions
    missions.update(dt, {
      playerX: st.root.position.x,
      playerZ: st.root.position.z,
      inCar: car,
      inCarType: car ? car.type : null,
      stars: police.stars,
      started4: job4Started,
      enemiesLeft: combat.aliveCount(),
      gangSpawned,
    });

    // death
    if (st.dead && playing) {
      playing = false;
      die();
    }

    // HUD
    const focus = car ? car.pos : st.root.position;
    hud.update({
      health: st.health,
      cash: st.cash,
      missionText: missions.current < 0
        ? 'All jobs done. Solara is yours, Rico.'
        : `<b>Job ${missions.job.id}: ${missions.job.name}</b><br>${missions.objectiveText()}`,
      stars: police.stars,
      speedKmh: Math.abs(car ? car.speed * 3.6 : st.speedNow * 3.6),
      ammo: combat.ammo,
      reserve: combat.reserve,
      reloading: combat.reloading,
      aiming: locked && !car,
      playerX: focus.x,
      playerZ: focus.z,
      playerHeadingX: Math.sin(st.heading),
      playerHeadingZ: Math.cos(st.heading),
      marker: missions.markerPos(),
      traffic: traffic.cars.filter((c) => c.alive).map((c) => ({ x: c.pos.x, z: c.pos.z })),
      cops: police.cruisers.map((c) => ({ x: c.pos.x, z: c.pos.z })),
      enemies: combat.enemies.filter((e) => e.alive).map((e) => ({ x: e.mesh.position.x, z: e.mesh.position.z })),
    }, dt);
  }

  if (AUTO && SHOT === 'city') {
    // fixed establishing camera: high over the north side, looking south
    // across the grid toward the beach and the bay
    camera.position.set(-72, 82, -138);
    camera.lookAt(0, 0, 60);
  } else {
    updateCamera(dt);
  }
  renderer.render(scene, camera);
}

if (AUTO) setupShot();
animate();

// Expose a tiny handle for the screenshot harness.
window.__solara = {
  get playing() { return playing; },
  get stars() { return police.stars; },
  get cash() { return player.state.cash; },
};
