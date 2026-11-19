// Police: the 5-star wanted system, patrol cars that chase and ram,
// foot cops, roadblocks at 4 stars, the helicopter at 3 stars, and the
// busted / wasted outcomes.

import { clamp, dist, makeRng, randRange, turnToward } from './util.js';
import { WORLD } from './city.js';
import { makeCar } from './vehicles.js';

export const WANTED_LABELS = ['', '1 STAR', '2 STARS', '3 STARS', '4 STARS', '5 STARS'];

/** How many cops / cars the wanted level fields. */
export function wantedForces(stars) {
  return {
    cars: stars === 0 ? 0 : stars === 1 ? 1 : stars === 2 ? 2 : stars === 3 ? 3 : stars === 4 ? 4 : 5,
    cops: stars === 0 ? 0 : stars * 2,
    heli: stars >= 3,
    roadblock: stars >= 4,
  };
}

/** Raise wanted, capped at 5. Returns the new level. */
export function addWanted(state, n) {
  state.wanted = clamp(state.wanted + n, 0, 5);
  state.wantedTimer = 0;
  return state.wanted;
}

/** Wanted decays when the player stays out of sight of every cop. */
export function decayWanted(state, dt, seen) {
  if (state.wanted === 0) return;
  if (seen) {
    state.wantedTimer = 0;
    return;
  }
  state.wantedTimer += dt;
  const need = state.wanted >= 4 ? 45 : state.wanted >= 3 ? 30 : 18;
  if (state.wantedTimer > need) {
    state.wanted--;
    state.wantedTimer = 0;
  }
}

/** Spawn / maintain police units around the player for the wanted level. */
export function maintainPolice(state, dt, rng) {
  const f = wantedForces(state.wanted);
  // Patrol cars.
  while (state.policeCars.length < f.cars) {
    const a = rng() * Math.PI * 2;
    const car = makeCar('comet', state.player.x + Math.cos(a) * 700, state.player.y + Math.sin(a) * 700, a, false);
    car.color = '#20242e';
    car.police = true;
    car.top = 520;
    car.accel = 340;
    state.policeCars.push(car);
  }
  while (state.policeCars.length > f.cars) state.policeCars.pop();
  // Foot cops.
  while (state.cops.length < f.cops) {
    const a = rng() * Math.PI * 2;
    state.cops.push({
      x: state.player.x + Math.cos(a) * 420, y: state.player.y + Math.sin(a) * 420,
      angle: a, speed: 150, health: 60, radius: 15, dead: false, police: true,
      bustTimer: 0, shootCd: 0,
    });
  }
  while (state.cops.length > f.cops) state.cops.pop();
  // Helicopter.
  state.heli.active = f.heli;
  if (state.heli.active) {
    state.heli.angle += dt * 0.5;
    state.heli.x = state.player.x + Math.cos(state.heli.angle) * 260;
    state.heli.y = state.player.y + Math.sin(state.heli.angle) * 260;
    state.heli.spot = state.heli.spot === undefined ? 0 : state.heli.spot;
  }
  // Roadblock: two police cars across the road ahead of the player.
  if (f.roadblock && !state.roadblock) {
    const px = state.player.x;
    const py = state.player.y;
    const ahead = state.player.car ? state.player.car.angle : state.player.angle;
    const bx = px + Math.cos(ahead) * 520;
    const by = py + Math.sin(ahead) * 520;
    state.roadblock = { x: bx, y: by, angle: ahead + Math.PI / 2, ttl: 40 };
  }
  if (state.roadblock) {
    state.roadblock.ttl -= dt;
    if (state.roadblock.ttl <= 0 || dist(state.player.x, state.player.y, state.roadblock.x, state.roadblock.y) > 900) {
      state.roadblock = null;
    }
  }
}

/** Chase the player: police cars ram, foot cops run in and try to bust. */
export function updatePolice(state, dt, city) {
  const p = state.player;
  const px = p.car ? p.car.x : p.x;
  const py = p.car ? p.car.y : p.y;
  let seen = false;
  for (const car of state.policeCars) {
    if (car.dead) continue;
    const d = dist(car.x, car.y, px, py);
    if (d < 700) seen = true;
    const target = Math.atan2(py - car.y, px - car.x);
    car.angle = turnToward(car.angle, target, dt * 2.4);
    const want = d > 120 ? car.top : car.top * 0.5;
    car.speed += (want - car.speed) * Math.min(1, dt * 1.2);
    car.x += Math.cos(car.angle) * car.speed * dt;
    car.y += Math.sin(car.angle) * car.speed * dt;
    car.x = clamp(car.x, 30, WORLD - 30);
    car.y = clamp(car.y, 30, WORLD - 30);
    // Ram the player's car.
    if (p.car && d < 60) {
      p.car.speed *= 0.94;
      p.car.health -= dt * 6;
      car.speed *= 0.8;
    }
  }
  for (const cop of state.cops) {
    if (cop.dead) continue;
    const d = dist(cop.x, cop.y, p.x, p.y);
    if (d < 500) seen = true;
    cop.angle = Math.atan2(p.y - cop.y, p.x - cop.x);
    const speed = cop.speed * (p.car ? 1 : 1.05);
    cop.x += Math.cos(cop.angle) * speed * dt;
    cop.y += Math.sin(cop.angle) * speed * dt;
    const probe = { x: cop.x, y: cop.y };
    if (city.resolveCollision(probe, 12)) {
      cop.x = probe.x;
      cop.y = probe.y;
    }
    // Bust: on foot, a cop standing on the player for 2 seconds.
    if (!p.car && d < 34) {
      cop.bustTimer += dt;
      if (cop.bustTimer > 2) state.busted = true;
    } else {
      cop.bustTimer = Math.max(0, cop.bustTimer - dt * 2);
    }
    // Cops shoot at 3+ stars when the player is armed and far.
    cop.shootCd -= dt;
    if (state.wanted >= 3 && d > 120 && d < 420 && cop.shootCd <= 0) {
      cop.shootCd = 1.4;
      state.enemyShots.push({ x: cop.x, y: cop.y, angle: cop.angle + (Math.random() - 0.5) * 0.2, damage: 6 });
    }
  }
  return seen;
}

/** Enemy shots fly toward the player and chip health. */
export function updateEnemyShots(state, dt, city) {
  for (const s of state.enemyShots) {
    s.x += Math.cos(s.angle) * 700 * dt;
    s.y += Math.sin(s.angle) * 700 * dt;
    s.life = (s.life || 0.6) - dt;
    if (s.life <= 0 || city.hitsBuilding(s.x, s.y, 2)) s.dead = true;
    if (!s.dead && dist(s.x, s.y, state.player.x, state.player.y) < 16) {
      state.player.health -= s.damage;
      s.dead = true;
      state.flash = 0.25;
    }
  }
  state.enemyShots = state.enemyShots.filter((s) => !s.dead);
}
