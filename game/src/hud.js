// HUD — health, cash, wanted stars, speedometer, ammo, mission text, dialogue
// subtitles, toasts, and the circular minimap drawn on a 2D canvas.

import { STREET_AT, WATER_Z } from './city.js';

export function createHUD() {
  const $ = (id) => document.getElementById(id);
  const el = {
    healthFill: $('health-fill'),
    cash: $('cash'),
    missionBox: $('mission-box'),
    stars: $('stars'),
    wantedLabel: $('wanted-label'),
    speed: $('speed'),
    ammo: $('ammo'),
    crosshair: $('crosshair'),
    subtitle: $('subtitle'),
    hint: $('hint'),
    toast: $('toast'),
    flash: $('objective-flash'),
    minimap: $('minimap'),
  };
  const ctx = el.minimap.getContext('2d');
  const MAP_R = 158; // canvas is 316x316
  const WORLD_R = 190; // world units shown across the map radius

  let subtitleTimer = 0;
  let toastTimer = 0;
  let flashTimer = 0;

  function worldToMap(wx, wz) {
    return {
      x: MAP_R + (wx / WORLD_R) * MAP_R,
      y: MAP_R + (wz / WORLD_R) * MAP_R,
    };
  }

  function drawMinimap(world) {
    const w = el.minimap.width, h = el.minimap.height;
    ctx.clearRect(0, 0, w, h);
    // clip to circle
    ctx.save();
    ctx.beginPath();
    ctx.arc(MAP_R, MAP_R, MAP_R - 2, 0, Math.PI * 2);
    ctx.clip();
    // land
    ctx.fillStyle = '#2d3a2e';
    ctx.fillRect(0, 0, w, h);
    // water (south)
    const waterY = worldToMap(0, WATER_Z).y;
    ctx.fillStyle = '#1e6f9e';
    ctx.fillRect(0, waterY, w, h - waterY);
    // beach strip
    ctx.fillStyle = '#c9b078';
    ctx.fillRect(0, waterY - 14, w, 14);
    // roads
    ctx.strokeStyle = '#5a5f68';
    ctx.lineWidth = 7;
    for (const s of STREET_AT) {
      const p = worldToMap(s, 0);
      ctx.beginPath(); ctx.moveTo(p.x, 0); ctx.lineTo(p.x, h); ctx.stroke();
      const q = worldToMap(0, s);
      ctx.beginPath(); ctx.moveTo(0, q.y); ctx.lineTo(w, q.y); ctx.stroke();
    }
    // pier
    ctx.strokeStyle = '#8a6a4a';
    ctx.lineWidth = 5;
    const pierTop = worldToMap(0, 156);
    const pierEnd = worldToMap(0, 222);
    ctx.beginPath(); ctx.moveTo(pierTop.x, pierTop.y); ctx.lineTo(pierEnd.x, pierEnd.y); ctx.stroke();
    // mission marker
    if (world.marker) {
      const m = worldToMap(world.marker.x, world.marker.z);
      ctx.fillStyle = '#ffd166';
      ctx.beginPath();
      ctx.moveTo(m.x, m.y - 9); ctx.lineTo(m.x + 8, m.y); ctx.lineTo(m.x, m.y + 9); ctx.lineTo(m.x - 8, m.y);
      ctx.closePath(); ctx.fill();
    }
    // traffic (grey dots)
    ctx.fillStyle = '#cbd5e1';
    for (const c of world.traffic || []) {
      const p = worldToMap(c.x, c.z);
      ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
    }
    // police (flashing red/blue)
    const copColor = Math.floor(performance.now() / 300) % 2 === 0 ? '#ff4444' : '#4488ff';
    ctx.fillStyle = copColor;
    for (const c of world.cops || []) {
      const p = worldToMap(c.x, c.z);
      ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2); ctx.fill();
    }
    // enemies (red diamonds)
    ctx.fillStyle = '#ff2222';
    for (const e of world.enemies || []) {
      const p = worldToMap(e.x, e.z);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - 5); ctx.lineTo(p.x + 4, p.y); ctx.lineTo(p.x, p.y + 5); ctx.lineTo(p.x - 4, p.y);
      ctx.closePath(); ctx.fill();
    }
    // player (white triangle, rotated by heading)
    const pp = worldToMap(world.playerX, world.playerZ);
    ctx.save();
    ctx.translate(pp.x, pp.y);
    ctx.rotate(Math.atan2(world.playerHeadingX || 0, world.playerHeadingZ || 1));
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -8); ctx.lineTo(6, 6); ctx.lineTo(-6, 6);
    ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.restore();
    // ring
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(MAP_R, MAP_R, MAP_R - 2, 0, Math.PI * 2);
    ctx.stroke();
  }

  function update(world, dt) {
    el.healthFill.style.width = Math.max(0, world.health) + '%';
    el.healthFill.style.background = world.health > 50
      ? 'linear-gradient(90deg, #34d399, #a3e635)'
      : world.health > 25 ? 'linear-gradient(90deg, #fbbf24, #f59e0b)' : 'linear-gradient(90deg, #ef4444, #dc2626)';
    el.cash.textContent = '$' + world.cash.toLocaleString('en-US');
    el.missionBox.innerHTML = world.missionText;
    const s = world.stars;
    el.stars.textContent = '★'.repeat(s) + '☆'.repeat(5 - s);
    el.wantedLabel.textContent = s === 0 ? 'Clean' : s <= 2 ? 'Wanted' : s <= 4 ? 'Hot' : 'MAX HEAT';
    el.wantedLabel.style.color = s === 0 ? '#9fb0c9' : '#fda4af';
    el.speed.textContent = Math.round(world.speedKmh);
    el.ammo.innerHTML = world.reloading ? 'RELOADING…' : `AMMO <b>${world.ammo}</b> / ${world.reserve}`;
    el.crosshair.style.display = world.aiming ? 'block' : 'none';
    drawMinimap(world);
    if (subtitleTimer > 0) {
      subtitleTimer -= dt;
      if (subtitleTimer <= 0) el.subtitle.style.display = 'none';
    }
    if (toastTimer > 0) {
      toastTimer -= dt;
      if (toastTimer <= 0) el.toast.style.display = 'none';
    }
    if (flashTimer > 0) {
      flashTimer -= dt;
      if (flashTimer <= 0) el.flash.style.display = 'none';
    }
  }

  function showSubtitle(who, line, seconds = 4) {
    el.subtitle.innerHTML = `<b>${who}:</b> ${line}`;
    el.subtitle.style.display = 'block';
    subtitleTimer = seconds;
  }

  function showToast(text, seconds = 2.5) {
    el.toast.textContent = text;
    el.toast.style.display = 'block';
    toastTimer = seconds;
  }

  function showFlash(title, sub, seconds = 3) {
    el.flash.innerHTML = `${title}<small>${sub}</small>`;
    el.flash.style.display = 'block';
    flashTimer = seconds;
  }

  function setHint(text) {
    el.hint.textContent = text;
  }

  return { update, showSubtitle, showToast, showFlash, setHint };
}
