// Combat — Rico's pistol (hitscan with tracer + muzzle flash), a melee swing,
// and the Bayfront gang: five armed enemies who guard the pier in the finale.

import * as THREE from 'three';
import { makeRng } from './city.js';

const MAG_SIZE = 12;
const ENEMY_HEALTH = 60;
const ENEMY_DAMAGE = 8;

function buildGangster(rng) {
  const g = new THREE.Group();
  const jacket = new THREE.MeshLambertMaterial({ color: [0x5b2a86, 0x8a2a2a, 0x2a4a86][Math.floor(rng() * 3)] });
  const skin = new THREE.MeshLambertMaterial({ color: 0xd9a077 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.85, 1.05, 0.45), jacket);
  torso.position.y = 1.1;
  torso.castShadow = true;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), skin);
  head.position.y = 1.9;
  g.add(head);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.55), new THREE.MeshLambertMaterial({ color: 0x111111 }));
  gun.position.set(0.5, 1.25, 0.3);
  g.add(gun);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.85, 0.3), new THREE.MeshLambertMaterial({ color: 0x222222 }));
  legL.position.set(-0.2, 0.42, 0);
  g.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.2;
  g.add(legR);
  return g;
}

export function createCombat(scene, colliders, onEnemyDown, onShotFired) {
  const rng = makeRng(31337);
  const raycaster = new THREE.Raycaster();
  const enemies = [];
  const tracers = [];
  let ammo = MAG_SIZE;
  let reserve = 60;
  let reloading = false;
  let reloadTimer = 0;
  let shootCooldown = 0;
  let meleeCooldown = 0;

  const tracerMat = new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.9 });

  function spawnGang(pierEnd) {
    const spots = [
      { x: pierEnd.x - 6, z: pierEnd.z - 26 },
      { x: pierEnd.x + 6, z: pierEnd.z - 26 },
      { x: pierEnd.x - 5, z: pierEnd.z - 8 },
      { x: pierEnd.x + 5, z: pierEnd.z - 8 },
      { x: pierEnd.x, z: pierEnd.z + 2 },
    ];
    for (const s of spots) {
      const mesh = buildGangster(rng);
      mesh.position.set(s.x, 0, s.z);
      scene.add(mesh);
      enemies.push({ mesh, health: ENEMY_HEALTH, alive: true, shootTimer: 1 + rng() * 2, home: { ...s } });
    }
  }

  function clearGang() {
    for (const e of enemies) scene.remove(e.mesh);
    enemies.length = 0;
  }

  function addTracer(from, to) {
    const dir = new THREE.Vector3().subVectors(to, from);
    const len = dir.length();
    const geo = new THREE.BoxGeometry(0.05, 0.05, len);
    const m = new THREE.Mesh(geo, tracerMat);
    m.position.copy(from).addScaledVector(dir, 0.5);
    m.lookAt(to);
    scene.add(m);
    tracers.push({ mesh: m, life: 0.09 });
  }

  // Fire from the player's shoulder toward the camera aim point.
  function shoot(origin, aimDir, targets) {
    if (shootingBlocked()) return null;
    ammo--;
    shootCooldown = 0.16;
    const end = origin.clone().addScaledVector(aimDir, 90);
    raycaster.set(origin, aimDir);
    raycaster.far = 90;
    const hits = raycaster.intersectObjects(targets, true);
    let hitPoint = end;
    let hitEnemy = null;
    if (hits.length > 0) {
      hitPoint = hits[0].point;
      let obj = hits[0].object;
      while (obj && obj.userData.enemyIndex === undefined) obj = obj.parent;
      if (obj) hitEnemy = enemies[obj.userData.enemyIndex];
    }
    addTracer(origin, hitPoint);
    if (onShotFired) onShotFired(origin);
    if (hitEnemy && hitEnemy.alive) {
      hitEnemy.health -= 34;
      if (hitEnemy.health <= 0) {
        hitEnemy.alive = false;
        hitEnemy.mesh.rotation.x = -Math.PI / 2;
        hitEnemy.mesh.position.y = 0.4;
        if (onEnemyDown) onEnemyDown(hitEnemy);
      }
    }
    return { hitPoint, hitEnemy };
  }

  function shootingBlocked() {
    return reloading || shootCooldown > 0 || ammo <= 0;
  }

  function reload() {
    if (reloading || ammo === MAG_SIZE || reserve <= 0) return false;
    reloading = true;
    reloadTimer = 1.1;
    return true;
  }

  function melee(origin, facing, targets) {
    if (meleeCooldown > 0) return null;
    meleeCooldown = 0.5;
    const range = 2.6;
    for (const e of enemies) {
      if (!e.alive) continue;
      const d = Math.hypot(e.mesh.position.x - origin.x, e.mesh.position.z - origin.z);
      if (d < range) {
        e.health -= 25;
        if (e.health <= 0) {
          e.alive = false;
          e.mesh.rotation.x = -Math.PI / 2;
          e.mesh.position.y = 0.4;
          if (onEnemyDown) onEnemyDown(e);
        }
        return e;
      }
    }
    return null;
  }

  function update(dt, playerPos, hurtPlayer) {
    shootCooldown = Math.max(0, shootCooldown - dt);
    meleeCooldown = Math.max(0, meleeCooldown - dt);
    if (reloading) {
      reloadTimer -= dt;
      if (reloadTimer <= 0) {
        const take = Math.min(MAG_SIZE - ammo, reserve);
        ammo += take;
        reserve -= take;
        reloading = false;
      }
    }
    for (let i = tracers.length - 1; i >= 0; i--) {
      tracers[i].life -= dt;
      if (tracers[i].life <= 0) {
        scene.remove(tracers[i].mesh);
        tracers.splice(i, 1);
      }
    }
    // enemies shoot at the player when close and alive
    for (const e of enemies) {
      if (!e.alive) continue;
      const d = Math.hypot(e.mesh.position.x - playerPos.x, e.mesh.position.z - playerPos.z);
      e.mesh.lookAt(playerPos.x, 0, playerPos.z);
      if (d < 42) {
        e.shootTimer -= dt;
        if (e.shootTimer <= 0) {
          e.shootTimer = 1.1 + rng() * 1.2;
          const from = e.mesh.position.clone().add(new THREE.Vector3(0, 1.4, 0));
          const to = playerPos.clone().add(new THREE.Vector3(0, 1.2, 0));
          addTracer(from, to);
          if (rng() > 0.45) hurtPlayer(ENEMY_DAMAGE);
        }
      }
      // drift back toward their post
      const hd = Math.hypot(e.mesh.position.x - e.home.x, e.mesh.position.z - e.home.z);
      if (hd > 1.5) {
        const s = 2.2 * dt;
        e.mesh.position.x += ((e.home.x - e.mesh.position.x) / hd) * s;
        e.mesh.position.z += ((e.home.z - e.mesh.position.z) / hd) * s;
      }
    }
  }

  function tagEnemyMeshes() {
    enemies.forEach((e, i) => {
      e.mesh.traverse((o) => { o.userData.enemyIndex = i; });
    });
  }

  function aliveCount() {
    return enemies.filter((e) => e.alive).length;
  }

  return {
    get ammo() { return ammo; },
    get reserve() { return reserve; },
    get reloading() { return reloading; },
    enemies, shoot, reload, melee, update, spawnGang, clearGang, tagEnemyMeshes, aliveCount,
  };
}
