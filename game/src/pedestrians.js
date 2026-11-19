// Pedestrians: sidewalk walkers who stroll, chat, and flee from gunfire,
// speeding cars and police sirens. Pure ambience plus a little chaos.

import { clamp, dist, makeRng, pick, randRange } from './util.js';
import { WORLD } from './city.js';

const FIRST = ['Ana', 'Luis', 'Carmen', 'Diego', 'Sofia', 'Miguel', 'Rosa', 'Javier', 'Lucia', 'Pedro', 'Elena', 'Carlos'];
const SHIRTS = ['#d94f4f', '#4f7ad9', '#4fd97a', '#d9c94f', '#9a4fd9', '#4fd9c9', '#d97a4f', '#7ad94f'];
const PANTS = ['#2a2a3a', '#3a3a2a', '#4a2a2a', '#2a3a4a'];

let nextPedId = 1;

/** Make one pedestrian near (x, y). */
export function makePed(x, y, rng) {
  return {
    id: nextPedId++, name: pick(rng, FIRST),
    x, y, angle: rng() * Math.PI * 2, speed: randRange(rng, 28, 55),
    shirt: pick(rng, SHIRTS), pants: pick(rng, PANTS),
    tx: x, ty: y, wait: randRange(rng, 0, 3), flee: 0, dead: false, panic: 0,
  };
}

/** Scatter peds across the city. */
export function seedPeds(city, rng, count) {
  const peds = [];
  for (let i = 0; i < count; i++) {
    const p = city.randomRoadPoint(rng);
    peds.push(makePed(p.x + randRange(rng, -50, 50), p.y + randRange(rng, -50, 50), rng));
  }
  return peds;
}

/** Keep peds near the player. */
export function maintainPeds(city, peds, px, py, rng, want) {
  for (let i = peds.length - 1; i >= 0; i--) {
    if (peds[i].dead || dist(peds[i].x, peds[i].y, px, py) > 1500) peds.splice(i, 1);
  }
  let guard = 0;
  while (peds.length < want && guard++ < 40) {
    const p = city.randomRoadPoint(rng);
    peds.push(makePed(p.x, p.y, rng));
  }
}

/** Ped update: wander between sidewalk points, flee from danger. */
export function updatePeds(peds, dt, city, danger, rng) {
  for (const p of peds) {
    if (p.dead) continue;
    // Flee from the nearest danger point.
    if (danger) {
      const d = dist(p.x, p.y, danger.x, danger.y);
      if (d < 260) {
        p.flee = 1.2;
        p.panic = 1;
        p.angle = Math.atan2(p.y - danger.y, p.x - danger.x);
      }
    }
    if (p.flee > 0) {
      p.flee -= dt;
      p.x += Math.cos(p.angle) * 150 * dt;
      p.y += Math.sin(p.angle) * 150 * dt;
    } else {
      p.wait -= dt;
      if (p.wait <= 0) {
        if (dist(p.x, p.y, p.tx, p.ty) < 24) {
          const t = city.randomWalkPoint(rng, p.x, p.y, 300);
          p.tx = t.x;
          p.ty = t.y;
          p.wait = randRange(rng, 0.5, 4);
        } else {
          p.angle = Math.atan2(p.ty - p.y, p.tx - p.x);
          p.x += Math.cos(p.angle) * p.speed * dt;
          p.y += Math.sin(p.angle) * p.speed * dt;
        }
      }
    }
    p.x = clamp(p.x, 30, WORLD - 30);
    p.y = clamp(p.y, 30, WORLD - 30);
    const probe = { x: p.x, y: p.y };
    if (city.resolveCollision(probe, 10)) {
      p.x = probe.x;
      p.y = probe.y;
      p.wait = 0;
      p.tx = p.x;
      p.ty = p.y;
    }
    p.panic = Math.max(0, p.panic - dt * 0.4);
  }
}
