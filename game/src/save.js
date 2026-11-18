// Save — progress persists in localStorage: cash, jobs completed, best wanted
// level survived, and cars unlocked. Loaded at boot, written on every change.

const KEY = 'solara-city-save-v1';

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return null;
    return {
      cash: typeof data.cash === 'number' ? data.cash : 0,
      jobsDone: Array.isArray(data.jobsDone) ? data.jobsDone : [],
      bestStars: typeof data.bestStars === 'number' ? data.bestStars : 0,
      carsStolen: typeof data.carsStolen === 'number' ? data.carsStolen : 0,
      playSeconds: typeof data.playSeconds === 'number' ? data.playSeconds : 0,
    };
  } catch (e) {
    return null;
  }
}

export function writeSave(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch (e) {
    return false;
  }
}

export function freshSave() {
  return { cash: 0, jobsDone: [], bestStars: 0, carsStolen: 0, playSeconds: 0 };
}
