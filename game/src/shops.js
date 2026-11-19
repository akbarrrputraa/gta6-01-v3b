// Shops and street life: gun shop, garage upgrades, safehouses, food
// stands, and the street race side activity. Interaction is press E in a
// zone; purchases use number keys while the shop menu is open.

import { dist } from './util.js';
import { LANDMARKS } from './city.js';
import { WEAPONS, weaponById } from './weapons.js';

export const GARAGE_UPGRADES = [
  { id: 'engine', name: 'Engine Tune', desc: '+12% top speed per level', prices: [600, 1200, 2400] },
  { id: 'armor', name: 'Armor Plating', desc: 'Car takes less damage', prices: [500, 1000, 2000] },
  { id: 'tires', name: 'Sport Tires', desc: 'Better grip and handling', prices: [400, 800, 1600] },
];

/** Shop zones with their world position and interaction radius. */
export function shopZones() {
  return [
    { id: 'guns', name: 'Iron & Lead Guns', kind: 'guns', x: LANDMARKS.gunShop.x, y: LANDMARKS.gunShop.y, r: 90 },
    { id: 'garage', name: 'Turbo Works Garage', kind: 'garage', x: LANDMARKS.garage.x, y: LANDMARKS.garage.y, r: 100 },
    { id: 'safe1', name: 'Safehouse — Old Town', kind: 'safehouse', x: LANDMARKS.safehouse1.x, y: LANDMARKS.safehouse1.y, r: 80 },
    { id: 'safe2', name: 'Safehouse — Beachfront', kind: 'safehouse', x: LANDMARKS.safehouse2.x, y: LANDMARKS.safehouse2.y, r: 80 },
    { id: 'safe3', name: 'Safehouse — Harbor', kind: 'safehouse', x: LANDMARKS.safehouse3.x, y: LANDMARKS.safehouse3.y, r: 80 },
    { id: 'food', name: 'Taco Sol', kind: 'food', x: LANDMARKS.foodStand.x, y: LANDMARKS.foodStand.y, r: 70 },
    { id: 'race', name: 'Boardwalk Race', kind: 'race', x: LANDMARKS.raceStart.x, y: LANDMARKS.raceStart.y, r: 90 },
  ];
}

/** The shop zone the player is standing in, or null. */
export function zoneAt(x, y) {
  for (const z of shopZones()) {
    if (dist(x, y, z.x, z.y) < z.r) return z;
  }
  return null;
}

/** Build the menu lines for an open shop, given the state. */
export function shopMenu(state, zone) {
  const lines = [];
  if (zone.kind === 'guns') {
    lines.push({ title: 'IRON & LEAD — buy with 1-9, E to leave' });
    WEAPONS.slice(1).forEach((w, i) => {
      const owned = state.player.loadout.owned.includes(w.id);
      const ammo = state.player.loadout.ammo[w.id];
      lines.push({
        key: String(i + 1),
        text: owned
          ? `${w.name} — ammo ${ammo}/${w.maxAmmo} — refill $${Math.floor(w.price / 3)}`
          : `${w.name} — $${w.price} (${w.damage} dmg)`,
        action: () => buyGun(state, w),
      });
    });
  } else if (zone.kind === 'garage') {
    lines.push({ title: 'TURBO WORKS — upgrades apply to your current car' });
    if (!state.player.car) {
      lines.push({ text: 'Bring a car here to upgrade it.' });
    } else {
      GARAGE_UPGRADES.forEach((u, i) => {
        const lvl = state.player.car[u.id] || 0;
        const price = lvl >= 3 ? null : u.prices[lvl];
        lines.push({
          key: String(i + 1),
          text: price === null
            ? `${u.name} — MAXED (Lv 3)`
            : `${u.name} — Lv ${lvl} → ${lvl + 1} — $${price} — ${u.desc}`,
          action: () => buyUpgrade(state, u),
        });
      });
    }
  } else if (zone.kind === 'safehouse') {
    lines.push({ title: `${zone.name.toUpperCase()} — press 1 to sleep & save` });
    lines.push({ key: '1', text: 'Sleep — restore health, save game', action: () => sleepAtSafehouse(state) });
  } else if (zone.kind === 'food') {
    lines.push({ title: 'TACO SOL — press 1 to eat' });
    lines.push({ key: '1', text: 'Verano Special — $25 — restores 40 health', action: () => eatFood(state) });
  } else if (zone.kind === 'race') {
    lines.push({ title: 'BOARDWALK RACE — press 1 to enter ($100 entry, $500 prize)' });
    lines.push({ key: '1', text: 'Enter the street race', action: () => startRace(state) });
  }
  return lines;
}

function buyGun(state, w) {
  const loadout = state.player.loadout;
  const owned = loadout.owned.includes(w.id);
  const price = owned ? Math.floor(w.price / 3) : w.price;
  if (state.cash < price) {
    state.toast = 'Not enough cash.';
    state.toastTimer = 2;
    state.sfx.fail();
    return;
  }
  state.cash -= price;
  if (!owned) loadout.owned.push(w.id);
  loadout.ammo[w.id] = Math.min(w.maxAmmo, loadout.ammo[w.id] + (owned ? w.maxAmmo : w.ammo));
  state.toast = owned ? `${w.name} ammo refilled.` : `${w.name} purchased! Press 1-4 to equip.`;
  state.toastTimer = 3;
  state.sfx.cash();
}

function buyUpgrade(state, u) {
  const car = state.player.car;
  if (!car) return;
  const lvl = car[u.id] || 0;
  if (lvl >= 3) return;
  const price = u.prices[lvl];
  if (state.cash < price) {
    state.toast = 'Not enough cash.';
    state.toastTimer = 2;
    state.sfx.fail();
    return;
  }
  state.cash -= price;
  car[u.id] = lvl + 1;
  if (u.id === 'tires') car.grip *= 1.08;
  state.toast = `${u.name} upgraded to Lv ${lvl + 1}.`;
  state.toastTimer = 3;
  state.sfx.cash();
}

function sleepAtSafehouse(state) {
  state.player.health = 100;
  state.player.armor = Math.max(state.player.armor, 50);
  state.wanted = 0;
  state.saveRequested = true;
  state.toast = 'You feel rested. Game saved.';
  state.toastTimer = 3;
  state.sfx.pickup();
  state.shop = null;
}

function eatFood(state) {
  if (state.cash < 25) {
    state.toast = 'Not enough cash.';
    state.toastTimer = 2;
    return;
  }
  state.cash -= 25;
  state.player.health = Math.min(100, state.player.health + 40);
  state.toast = 'Delicious. +40 health.';
  state.toastTimer = 2;
  state.sfx.pickup();
}

function startRace(state) {
  if (state.cash < 100) {
    state.toast = 'Entry is $100. Come back with cash.';
    state.toastTimer = 2;
    return;
  }
  state.cash -= 100;
  state.shop = null;
  state.race = {
    points: [
      { x: 3400, y: 4200 }, { x: 4000, y: 4400 }, { x: 4400, y: 4000 },
      { x: 4200, y: 3400 }, { x: 3400, y: 3400 }, { x: 3400, y: 4200 },
    ],
    checkpoint: 0, timer: 75, active: true,
  };
  state.toast = 'RACE! Hit all 6 checkpoints in 75 seconds to win $500.';
  state.toastTimer = 4;
  state.sfx.mission();
}

/** Street race update; returns 'win' | 'lose' | null. */
export function updateRace(state, dt) {
  const r = state.race;
  if (!r || !r.active) return null;
  const p = state.player;
  const px = p.car ? p.car.x : p.x;
  const py = p.car ? p.car.y : p.y;
  r.timer -= dt;
  if (r.timer <= 0) {
    state.race = null;
    state.toast = 'Race lost — out of time.';
    state.toastTimer = 3;
    state.sfx.fail();
    return 'lose';
  }
  const pt = r.points[r.checkpoint];
  if (pt && dist(px, py, pt.x, pt.y) < 70) {
    r.checkpoint++;
    state.sfx.pickup();
    if (r.checkpoint >= r.points.length) {
      state.race = null;
      state.cash += 500;
      state.toast = 'RACE WON! +$500';
      state.toastTimer = 4;
      state.sfx.cash();
      return 'win';
    }
  }
  return null;
}
