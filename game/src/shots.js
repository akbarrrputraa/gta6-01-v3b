// Deterministic screenshot poses for VERANO HEAT: ?shot=menu|drive|mission|chase
// (with &seed= for the RNG) sets the game into a staged, readable scene so
// the dossier screenshots show the city, the HUD, the minimap and the
// systems at their best. Never used during normal play.

import { LANDMARKS } from './city.js';
import { makeCar } from './vehicles.js';
import { startMission } from './missions.js';
import { addWanted } from './police.js';

/** Apply a shot pose to a fresh state. Returns true when a pose matched. */
export function applyShot(state, name) {
  const rng = state.rng;
  if (name === 'menu') {
    state.mode = 'menu';
    return true;
  }
  state.mode = 'playing';
  if (name === 'drive') {
    // Dario in a Viento GT, mid-drive through Downtown, light traffic.
    const car = makeCar('viento', 1000, 1800, 0, false);
    state.player.car = car;
    state.player.x = car.x;
    state.player.y = car.y;
    car.speed = 380;
    state.cash = 12450;
    state.toast = 'Downtown — grab a ride, any ride.';
    state.toastTimer = 99;
    return true;
  }
  if (name === 'mission') {
    // Mission 3 in progress: Rojos around Calle Sol, objective on the HUD.
    startMission(state, 2);
    state.player.x = 1950;
    state.player.y = 2280;
    state.player.angle = -Math.PI / 2;
    state.cash = 8450;
    state.toast = '';
    state.toastTimer = 0;
    return true;
  }
  if (name === 'chase') {
    // 4-star pursuit: patrol cars, heli, roadblock, wanted stars lit.
    const car = makeCar('viento', 1000, 1800, 0, false);
    state.player.car = car;
    state.player.x = car.x;
    state.player.y = car.y;
    car.speed = 460;
    addWanted(state, 4);
    state.cash = 18200;
    state.toast = '4 STARS — lose the VPD!';
    state.toastTimer = 99;
    return true;
  }
  return false;
}
