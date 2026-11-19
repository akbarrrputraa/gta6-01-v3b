// Weapons: fists plus 4 guns, a hold-Q weapon wheel, bullets, and the
// consequences of firing them in public.

import { clamp, dist } from './util.js';

export const WEAPONS = [
  { id: 'fists', name: 'Fists', kind: 'melee', damage: 12, rate: 0.35, range: 34, speed: 0, spread: 0, ammo: Infinity, maxAmmo: Infinity, color: '#d9a06a' },
  { id: 'pistol', name: 'P9 Pistol', kind: 'gun', damage: 22, rate: 0.28, range: 420, speed: 900, spread: 0.03, ammo: 24, maxAmmo: 120, price: 350, color: '#c9c9c9' },
  { id: 'smg', name: 'Raptor-9 SMG', kind: 'gun', damage: 14, rate: 0.09, range: 380, speed: 950, spread: 0.07, ammo: 60, maxAmmo: 300, price: 900, color: '#7a7a8a' },
  { id: 'shotgun', name: 'Boomstick 12', kind: 'gun', damage: 16, rate: 0.8, range: 260, speed: 800, spread: 0.16, pellets: 6, ammo: 12, maxAmmo: 60, price: 1200, color: '#8a5a2a' },
  { id: 'rifle', name: 'VK-7 Rifle', kind: 'gun', damage: 45, rate: 0.5, range: 640, speed: 1400, spread: 0.015, ammo: 20, maxAmmo: 100, price: 2200, color: '#3a3a4a' },
];

export function weaponById(id) {
  return WEAPONS.find((w) => w.id === id) || WEAPONS[0];
}

/** A player's weapon loadout: owned ids, per-weapon ammo, selected index. */
export function makeLoadout() {
  const ammo = {};
  for (const w of WEAPONS) ammo[w.id] = w.id === 'fists' ? Infinity : 0;
  ammo.pistol = 24;
  return { owned: ['fists', 'pistol'], ammo, selected: 1 };
}

export function currentWeapon(loadout) {
  return weaponById(loadout.owned[loadout.selected] || 'fists');
}

/** Fire the selected weapon. Returns bullets created (or a melee swing). */
export function fireWeapon(loadout, x, y, angle, now) {
  const w = currentWeapon(loadout);
  if (w.kind === 'melee') return { kind: 'melee', weapon: w, x, y, angle };
  if (loadout.ammo[w.id] <= 0) return { kind: 'dry', weapon: w };
  loadout.ammo[w.id]--;
  const pellets = w.pellets || 1;
  const bullets = [];
  for (let i = 0; i < pellets; i++) {
    const a = angle + (Math.random() - 0.5) * 2 * w.spread;
    bullets.push({
      x: x + Math.cos(angle) * 26, y: y + Math.sin(angle) * 26,
      vx: Math.cos(a) * w.speed, vy: Math.sin(a) * w.speed,
      damage: w.damage, range: w.range, traveled: 0, dead: false,
    });
  }
  return { kind: 'shot', weapon: w, bullets };
}

/** Move bullets; returns hits: {x, y, damage, target} for the caller to apply. */
export function updateBullets(bullets, dt, city, targets) {
  const hits = [];
  for (const b of bullets) {
    if (b.dead) continue;
    const step = Math.min(dt, 0.02);
    b.x += b.vx * step;
    b.y += b.vy * step;
    b.traveled += Math.hypot(b.vx, b.vy) * step;
    if (b.traveled > b.range || city.hitsBuilding(b.x, b.y, 2)) {
      b.dead = true;
      continue;
    }
    for (const t of targets) {
      if (t.dead || t.health === undefined) continue;
      const r = t.radius || 16;
      if (dist(b.x, b.y, t.x, t.y) < r) {
        b.dead = true;
        hits.push({ x: b.x, y: b.y, damage: b.damage, target: t });
        break;
      }
    }
  }
  return hits;
}

/** Melee swing: damage anything within range and in front. */
export function meleeHit(x, y, angle, targets, damage) {
  const hits = [];
  for (const t of targets) {
    if (t.dead || t.health === undefined) continue;
    const r = (t.radius || 16) + 14;
    if (dist(x, y, t.x, t.y) < r) {
      const a = Math.atan2(t.y - y, t.x - x);
      let d = a - angle;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      if (Math.abs(d) < 1.1) hits.push({ x: t.x, y: t.y, damage, target: t });
    }
  }
  return hits;
}
