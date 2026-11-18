// Missions — five jobs for Mara the fixer. A small state machine per job: each
// has a start point, staged objectives, dialogue lines, and a cash payout.

import * as THREE from 'three';

export const JOBS = [
  {
    id: 1, name: 'First Wheels', pay: 400,
    brief: 'Mara needs a Falcon GT from the north lot. Take it and bring it to her garage.',
    lines: [
      ['MARA', 'Rico. First job, easy money. There is a Falcon GT parked up north. Bring it to my garage — no scratches, no cops.'],
      ['RICO', 'One shiny car, coming up.'],
    ],
  },
  {
    id: 2, name: 'The Package', pay: 700,
    brief: 'Pick up the package at the docks and deliver it to the plaza. Stay out of sight.',
    lines: [
      ['MARA', 'A package is waiting at the south docks. Pick it up, bring it to the plaza fountain. And Rico — keep your nose clean.'],
      ['RICO', 'In and out. Nobody sees a thing.'],
    ],
  },
  {
    id: 3, name: 'Heat Wave', pay: 900,
    brief: 'The cops are onto you. Survive a 3-star wanted level for 60 seconds.',
    lines: [
      ['MARA', 'Change of plan — the PD just put your name on the board. You wanted a reputation? Survive sixty seconds of heat and it is yours.'],
      ['RICO', 'Sixty seconds. I can do sixty seconds.'],
    ],
  },
  {
    id: 4, name: 'The Getaway', pay: 1200,
    brief: 'The heist went loud. Lose a 4-star wanted level — break line of sight and stay hidden.',
    lines: [
      ['MARA', 'The crew hit the vault and the whole city is screaming. Four stars, Rico. Lose them. Hide, go quiet, wait it out.'],
      ['RICO', 'Time to disappear.'],
    ],
  },
  {
    id: 5, name: 'Bayfront Showdown', pay: 2500,
    brief: 'The Bayfront gang moved on Mara’s turf. Clear all five gunmen off the pier.',
    lines: [
      ['MARA', 'The Bayfront gang thinks the pier is theirs now. Five of them, armed. Take the pier back, Rico. All of it.'],
      ['RICO', 'The pier is mine. Tell them I am coming.'],
    ],
  },
];

// Objective spots (world coords). Mara's garage is near her spot; docks are south.
const SPOTS = {
  maraGarage: { x: -20, z: 116 },
  northLot: { x: 80, z: -120 },
  docks: { x: 120, z: 140 },
  plaza: { x: 0, z: 22 },
  pier: { x: 0, z: 200 },
};

export function createMissions(scene, onEvent) {
  // event: {type: 'start'|'objective'|'complete'|'failed'|'line', job, text}
  const markerGeo = new THREE.CylinderGeometry(2.2, 2.2, 0.3, 24);
  const markerMat = new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.85 });
  const marker = new THREE.Mesh(markerGeo, markerMat);
  marker.visible = false;
  scene.add(marker);
  const beaconGeo = new THREE.CylinderGeometry(0.25, 0.25, 60, 8);
  const beaconMat = new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.35 });
  const beacon = new THREE.Mesh(beaconGeo, beaconMat);
  beacon.visible = false;
  scene.add(beacon);

  let current = 0; // index into JOBS, -1 when all done
  let stage = 0; // objective stage within the job
  let timer = 0; // job timer (heat wave)
  let active = false;
  let carDelivered = null; // job 1: the car to deliver
  let hasPackage = false;

  function job() { return JOBS[current]; }

  function setMarker(x, z) {
    marker.position.set(x, 0.4, z);
    beacon.position.set(x, 30, z);
    marker.visible = true;
    beacon.visible = true;
  }
  function hideMarker() {
    marker.visible = false;
    beacon.visible = false;
  }

  function emit(type, text) {
    if (onEvent) onEvent({ type, job: job(), text });
  }

  function startJob(index) {
    current = index;
    stage = 0;
    timer = 0;
    active = true;
    hasPackage = false;
    carDelivered = null;
    const j = job();
    emit('start', j.brief);
    for (const [who, line] of j.lines) emit('line', { who, line });
    if (j.id === 1) setMarker(SPOTS.northLot.x, SPOTS.northLot.z);
    if (j.id === 2) setMarker(SPOTS.docks.x, SPOTS.docks.z);
    if (j.id === 5) setMarker(SPOTS.pier.x, SPOTS.pier.z);
  }

  function completeJob() {
    const j = job();
    emit('complete', j);
    active = false;
    hideMarker();
    current++;
    if (current >= JOBS.length) current = -1;
  }

  function objectiveText() {
    if (current < 0) return 'All jobs done. Solara is yours, Rico.';
    const j = job();
    if (!active) return 'Drive to the gold marker to start the job.';
    switch (j.id) {
      case 1: return stage === 0 ? 'Steal the Falcon GT at the north lot.' : 'Deliver the Falcon GT to Mara’s garage.';
      case 2: return stage === 0 ? 'Pick up the package at the south docks.' : 'Deliver the package to the plaza fountain.';
      case 3: return `Survive the heat: ${Math.max(0, Math.ceil(60 - timer))}s left.`;
      case 4: return 'Lose the cops — break line of sight until the stars fade.';
      case 5: return 'Clear the pier of all five gunmen.';
      default: return j.brief;
    }
  }

  function markerPos() {
    if (!marker.visible) return null;
    return { x: marker.position.x, z: marker.position.z };
  }

  // Per-frame logic. ctx carries everything the jobs need to read.
  function update(dt, ctx) {
    // pulse the marker
    if (marker.visible) {
      const s = 1 + Math.sin(performance.now() / 280) * 0.15;
      marker.scale.set(s, 1, s);
    }
    if (current < 0) return;
    const j = job();
    const px = ctx.playerX, pz = ctx.playerZ;
    if (!active) {
      // waiting at the start marker: job 1 starts at Mara's spot
      const sx = j.id === 1 ? -20 : SPOTS.maraGarage.x;
      const sz = j.id === 1 ? 100 : SPOTS.maraGarage.z;
      setMarker(sx, sz);
      if (Math.hypot(px - sx, pz - sz) < 6) startJob(current);
      return;
    }
    if (j.id === 1) {
      if (stage === 0) {
        if (Math.hypot(px - SPOTS.northLot.x, pz - SPOTS.northLot.z) < 8 && ctx.inCarType === 'sports') {
          stage = 1;
          carDelivered = ctx.inCar;
          setMarker(SPOTS.maraGarage.x, SPOTS.maraGarage.z);
          emit('objective', 'Got the Falcon. Now get it to Mara’s garage.');
        }
      } else if (Math.hypot(px - SPOTS.maraGarage.x, pz - SPOTS.maraGarage.z) < 8 && ctx.inCar === carDelivered) {
        completeJob();
      }
    } else if (j.id === 2) {
      if (stage === 0) {
        if (Math.hypot(px - SPOTS.docks.x, pz - SPOTS.docks.z) < 7) {
          stage = 1;
          hasPackage = true;
          setMarker(SPOTS.plaza.x, SPOTS.plaza.z);
          emit('objective', 'Package secured. Deliver it to the plaza.');
        }
      } else if (hasPackage && Math.hypot(px - SPOTS.plaza.x, pz - SPOTS.plaza.z) < 7) {
        completeJob();
      }
    } else if (j.id === 3) {
      if (ctx.stars >= 3) {
        timer += dt;
        if (timer >= 60) completeJob();
      }
    } else if (j.id === 4) {
      if (ctx.started4 && ctx.stars === 0) completeJob();
    } else if (j.id === 5) {
      if (ctx.enemiesLeft === 0 && ctx.gangSpawned) completeJob();
    }
  }

  function startMarkerForJob() {
    if (current < 0) return null;
    return { x: -20, z: 100 };
  }

  return {
    get current() { return current; },
    get active() { return active; },
    get job() { return current >= 0 ? JOBS[current] : null; },
    SPOTS, startJob, completeJob, update, objectiveText, markerPos, startMarkerForJob,
    setCurrent(i) { current = i; },
  };
}
