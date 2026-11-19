// Vehicles: 7 original models, player driving physics, traffic AI.

import { clamp, dist, makeRng, pick, randRange, turnToward } from './util.js';
import { ROAD_LINES, ROAD_W, WORLD, nearestRoadLine, onRoad } from './city.js';

export const VEHICLE_TYPES = [
  { id: 'comet', name: 'Comet Sedan', top: 430, accel: 260, grip: 3.4, color: '#c94f3d', w: 46, h: 22, price: 0 },
  { id: 'hatch', name: 'Pipit Hatch', top: 360, accel: 300, grip: 3.8, color: '#3d7ac9', w: 40, h: 20, price: 0 },
  { id: 'pickup', name: 'Bison Pickup', top: 380, accel: 240, grip: 3.0, color: '#7a8a3d', w: 50, h: 24, price: 0 },
  { id: 'taxi', name: 'Sol Taxi', top: 400, accel: 270, grip: 3.5, color: '#e8b820', w: 44, h: 22, price: 0 },
  { id: 'van', name: 'Mula Van', top: 330, accel: 200, grip: 2.8, color: '#8a8a8a', w: 52, h: 24, price: 0 },
  { id: 'viento', name: 'Viento GT', top: 560, accel: 380, grip: 4.2, color: '#c92d7a', w: 46, h: 21, price: 0 },
  { id: 'duna', name: 'Duna 250', top: 480, accel: 340, grip: 4.6, color: '#2dc9a0', w: 34, h: 14, price: 0 },
];

export function vehicleType(id) {
  return VEHICLE_TYPES.find((v) => v.id === id) || VEHICLE_TYPES[0];
}

let nextCarId = 1;

/** Make a car entity. `traffic` cars drive themselves; the player's is driven. */
export function makeCar(typeId, x, y, angle, traffic) {
  const t = vehicleType(typeId);
  return {
    id: nextCarId++, type: t.id, name: t.name, color: t.color,
    x, y, angle, speed: 0, w: t.w, h: t.h,
    top: t.top, accel: t.accel, grip: t.grip,
    traffic: !!traffic, dead: false, smoke: 0, health: 100,
    engine: 0, armor: 0, tires: 0, // garage upgrade levels 0..3
    targetAngle: angle, stuck: 0, horn: 0,
  };
}

/** Top speed with garage engine upgrades. */
export function carTopSpeed(car) {
  return car.top * (1 + 0.12 * (car.engine || 0));
}

/** Scatter parked + moving cars across the city at start. */
export function seedTraffic(city, rng, count) {
  const cars = [];
  for (let i = 0; i < count; i++) {
    const p = city.randomRoadPoint(rng);
    const vertical = Math.abs(p.x - nearestRoadLine(p.x)) < Math.abs(p.y - nearestRoadLine(p.y));
    const angle = vertical ? (rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2) : (rng() < 0.5 ? 0 : Math.PI);
    const car = makeCar(pick(rng, VEHICLE_TYPES).id, p.x, p.y, angle, true);
    car.speed = randRange(rng, 60, 140);
    cars.push(car);
  }
  return cars;
}

/** Keep traffic near the player: recycle far cars, top up the count. */
export function maintainTraffic(city, cars, px, py, rng, want) {
  for (let i = cars.length - 1; i >= 0; i--) {
    const c = cars[i];
    if (c.dead || dist(c.x, c.y, px, py) > 1600) cars.splice(i, 1);
  }
  let guard = 0;
  while (cars.length < want && guard++ < 40) {
    const a = rng() * Math.PI * 2;
    const d = randRange(rng, 700, 1300);
    const p = city.randomRoadPoint(rng);
    const car = makeCar(pick(rng, VEHICLE_TYPES).id, p.x, p.y, rng() * Math.PI * 2, true);
    car.speed = randRange(rng, 60, 150);
    cars.push(car);
  }
}

/** Drive the player's car: throttle/brake/steer, collisions, skid smoke. */
export function drivePlayerCar(car, input, dt, city, sfx) {
  const top = carTopSpeed(car);
  const fwd = input.up ? 1 : input.down ? -0.6 : 0;
  car.speed += fwd * car.accel * dt;
  if (!input.up && !input.down) car.speed *= Math.pow(0.4, dt);
  if (input.handbrake) car.speed *= Math.pow(0.05, dt);
  car.speed = clamp(car.speed, -top * 0.45, top);
  const steer = (input.left ? -1 : 0) + (input.right ? 1 : 0);
  const spd = Math.abs(car.speed) / top;
  car.angle += steer * car.grip * spd * dt * Math.sign(car.speed || 1) * (input.handbrake ? 1.5 : 1);
  const nx = car.x + Math.cos(car.angle) * car.speed * dt;
  const ny = car.y + Math.sin(car.angle) * car.speed * dt;
  const probe = { x: nx, y: ny };
  if (city.resolveCollision(probe, Math.max(car.w, car.h) / 2 - 4)) {
    if (Math.abs(car.speed) > 180 && sfx) sfx.crash();
    car.speed *= 0.35;
    car.health -= Math.abs(car.speed) * 0.02;
  }
  car.x = clamp(probe.x, 40, WORLD - 40);
  car.y = clamp(probe.y, 40, WORLD - 40);
  if (input.handbrake && spd > 0.3) car.smoke = Math.min(1, car.smoke + dt * 3);
  else car.smoke = Math.max(0, car.smoke - dt * 2);
  if (car.health <= 0) {
    car.dead = true;
    car.smoke = 1;
  }
}

/** Traffic AI: follow the road grid, stop for cars ahead, turn at random. */
export function updateTraffic(cars, dt, city, player, rng) {
  for (const c of cars) {
    if (c.dead) continue;
    const wantSpeed = 110 + Math.sin(c.id * 1.7) * 30;
    // Slow down if a car is right ahead.
    let blocked = false;
    for (const o of cars) {
      if (o === c || o.dead) continue;
      const d = dist(c.x, c.y, o.x, o.y);
      if (d < 70) {
        const a = Math.atan2(o.y - c.y, o.x - c.x);
        if (Math.abs(a - c.angle) < 0.7) blocked = true;
      }
    }
    const pd = player.car ? dist(c.x, c.y, player.car.x, player.car.y) : Infinity;
    if (pd < 70) blocked = true;
    c.speed += ((blocked ? 0 : wantSpeed) - c.speed) * Math.min(1, dt * 1.5);
    // Steer toward the nearest road line.
    const vertical = Math.abs(Math.sin(c.angle)) > Math.abs(Math.cos(c.angle));
    let target;
    if (vertical) {
      target = Math.sin(c.angle) > 0 ? Math.PI / 2 : -Math.PI / 2;
      const line = nearestRoadLine(c.x);
      const off = line - c.x;
      target += clamp(off * 0.004, -0.5, 0.5) * Math.sign(Math.sin(c.angle));
    } else {
      target = Math.cos(c.angle) > 0 ? 0 : Math.PI;
      const line = nearestRoadLine(c.y);
      const off = line - c.y;
      target += clamp(off * 0.004, -0.5, 0.5) * Math.sign(Math.cos(c.angle));
    }
    c.angle = turnToward(c.angle, target, dt * 1.6);
    // Random turn at an intersection.
    if (onRoad(c.x, c.y) && rng() < dt * 0.12) {
      c.angle += (rng() < 0.5 ? 1 : -1) * Math.PI / 2;
    }
    c.x += Math.cos(c.angle) * c.speed * dt;
    c.y += Math.sin(c.angle) * c.speed * dt;
    c.x = clamp(c.x, 30, WORLD - 30);
    c.y = clamp(c.y, 30, WORLD - 30);
    if (city.hitsBuilding(c.x, c.y, 20)) {
      c.angle += Math.PI / 2;
      c.x -= Math.cos(c.angle) * 30;
      c.y -= Math.sin(c.angle) * 30;
    }
  }
}
