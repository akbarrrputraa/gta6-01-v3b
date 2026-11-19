// Save / load: the whole campaign state in one localStorage slot.
// Autosaves after missions and at safehouses; F5 saves, F9 loads.

const SAVE_KEY = 'verano-heat-save-v1';

/** Serialize the parts of the state that persist. */
export function serializeState(state) {
  const p = state.player;
  return {
    v: 1,
    cash: state.cash,
    missionsDone: state.missionsDone,
    nextMission: state.nextMission,
    standing: state.standing,
    racesWon: state.racesWon || 0,
    kills: state.kills || 0,
    carsStolen: state.carsStolen || 0,
    playTime: state.time,
    player: {
      x: p.x, y: p.y, angle: p.angle, health: p.health, armor: p.armor,
      loadout: p.loadout,
      car: p.car ? { type: p.car.type, x: p.car.x, y: p.car.y, angle: p.car.angle, engine: p.car.engine, armor: p.car.armor, tires: p.car.tires, health: p.car.health, color: p.car.color } : null,
    },
    wanted: 0,
  };
}

/** Write the save. Returns true on success. */
export function saveGame(state) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(serializeState(state)));
    return true;
  } catch {
    return false;
  }
}

/** Read the save, or null when there is none / it is unreadable. */
export function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.v !== 1) return null;
    return data;
  } catch {
    return null;
  }
}

/** True when a save exists. */
export function hasSave() {
  try {
    return localStorage.getItem(SAVE_KEY) !== null;
  } catch {
    return false;
  }
}
