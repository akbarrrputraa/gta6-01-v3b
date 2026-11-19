// Port Verano: the city itself. A fixed 4800x4800 world on a road grid,
// 9 named districts, seeded buildings, parks, beach and harbor water.
// Everything here is deterministic (seed 7) so screenshots repeat.

import { clamp, makeRng, pick, randInt, randRange } from './util.js';

export const WORLD = 4800;
export const ROAD_STEP = 400;
export const ROAD_W = 96;

export const DISTRICTS = [
  { name: 'Marina Bay', x: 0, y: 0, w: 1600, h: 1600, tint: '#3f7d8c', desc: 'Yachts and glass towers' },
  { name: 'Old Town', x: 1600, y: 0, w: 1600, h: 1600, tint: '#b98a4e', desc: 'Colonial streets and plazas' },
  { name: 'North Hills', x: 3200, y: 0, w: 1600, h: 1600, tint: '#6f8f5a', desc: 'Mansions above the city' },
  { name: 'Downtown', x: 0, y: 1600, w: 1600, h: 1600, tint: '#5a6f9e', desc: 'Skyscrapers and neon' },
  { name: 'Calle Sol', x: 1600, y: 1600, w: 1600, h: 1600, tint: '#c96a4a', desc: 'Markets, murals and music' },
  { name: 'University', x: 3200, y: 1600, w: 1600, h: 1600, tint: '#7a5a9e', desc: 'Campus quads and dorms' },
  { name: 'Harbor', x: 0, y: 3200, w: 1600, h: 1600, tint: '#4a6a7a', desc: 'Docks, cranes and warehouses' },
  { name: 'Industrial', x: 1600, y: 3200, w: 1600, h: 1600, tint: '#7a6a55', desc: 'Factories and truck yards' },
  { name: 'Beachfront', x: 3200, y: 3200, w: 1600, h: 1600, tint: '#d8b25e', desc: 'Sand, surf and boardwalk' },
];

/** District at a world point, or null. */
export function districtAt(x, y) {
  for (const d of DISTRICTS) {
    if (x >= d.x && x < d.x + d.w && y >= d.y && y < d.y + d.h) return d;
  }
  return null;
}

/** Road centre lines (x or y coordinates) across the world. */
export const ROAD_LINES = [];
for (let v = ROAD_STEP / 2; v < WORLD; v += ROAD_STEP) ROAD_LINES.push(v);

/** Is (x,y) on a road (within half road width of a line)? */
export function onRoad(x, y) {
  for (const l of ROAD_LINES) {
    if (Math.abs(x - l) < ROAD_W / 2 || Math.abs(y - l) < ROAD_W / 2) return true;
  }
  return false;
}

/** Nearest road centre coordinate to v on one axis. */
export function nearestRoadLine(v) {
  let best = ROAD_LINES[0];
  let bd = Infinity;
  for (const l of ROAD_LINES) {
    const d = Math.abs(v - l);
    if (d < bd) {
      bd = d;
      best = l;
    }
  }
  return best;
}

/** Landmark spots the game uses for missions, shops and spawns. */
export const LANDMARKS = {
  marasOffice: { x: 1800, y: 1800, label: "Mara's Office" },
  safehouse1: { x: 1800, y: 600, label: 'Safehouse — Old Town' },
  safehouse2: { x: 3800, y: 3800, label: 'Safehouse — Beachfront' },
  safehouse3: { x: 600, y: 3800, label: 'Safehouse — Harbor' },
  gunShop: { x: 2200, y: 2200, label: 'Iron & Lead Guns' },
  garage: { x: 2600, y: 3400, label: 'Turbo Works Garage' },
  hospital: { x: 1000, y: 2200, label: 'Verano General' },
  policeHQ: { x: 600, y: 1800, label: 'VPD Headquarters' },
  bank: { x: 1000, y: 1800, label: 'Banco Verano' },
  harbor: { x: 400, y: 4200, label: 'Harbor Docks' },
  beach: { x: 4200, y: 4400, label: 'Beachfront' },
  raceStart: { x: 3400, y: 4200, label: 'Boardwalk Race Start' },
  foodStand: { x: 2000, y: 2600, label: 'Taco Sol' },
  compound: { x: 4200, y: 800, label: "El Toro's Compound" },
};

export class City {
  constructor() {
    const rng = makeRng(7);
    this.buildings = [];
    this.trees = [];
    this.parks = [];
    // One building per block between the roads, inset from them, with a district tint.
    // Road lines sit at ROAD_STEP/2 + k*ROAD_STEP, so blocks live between them.
    const BLOCKS = Math.floor(WORLD / ROAD_STEP) - 1;
    for (let bx = 0; bx < BLOCKS; bx++) {
      for (let by = 0; by < BLOCKS; by++) {
        const x0 = ROAD_STEP / 2 + ROAD_W / 2 + 14 + bx * ROAD_STEP;
        const y0 = ROAD_STEP / 2 + ROAD_W / 2 + 14 + by * ROAD_STEP;
        const w = ROAD_STEP - ROAD_W - 28;
        const h = ROAD_STEP - ROAD_W - 28;
        const cx = x0 + w / 2;
        const cy = y0 + h / 2;
        const d = districtAt(cx, cy);
        // Beachfront bottom strip is sand, harbor bottom-left is water edge.
        if (d && d.name === 'Beachfront' && by >= 10) {
          this.parks.push({ x: x0, y: y0, w, h, kind: 'sand' });
          continue;
        }
        if (d && d.name === 'Harbor' && bx === 0 && by >= 10) {
          this.parks.push({ x: x0, y: y0, w, h, kind: 'water' });
          continue;
        }
        if (rng() < 0.12) {
          this.parks.push({ x: x0, y: y0, w, h, kind: 'park' });
          for (let t = 0; t < 6; t++) {
            this.trees.push({ x: randRange(rng, x0 + 20, x0 + w - 20), y: randRange(rng, y0 + 20, y0 + h - 20), r: randRange(rng, 10, 16) });
          }
          continue;
        }
        const tall = d && (d.name === 'Downtown' || d.name === 'Marina Bay');
        const bw = randRange(rng, w * 0.45, w * 0.85);
        const bh = randRange(rng, h * 0.45, h * 0.85);
        const bx0 = x0 + (w - bw) / 2 + randRange(rng, -14, 14);
        const by0 = y0 + (h - bh) / 2 + randRange(rng, -14, 14);
        const palette = ['#8a7a66', '#a08a6a', '#7a8a9a', '#9a7a7a', '#6a7a6a', '#b0a080', '#8a8a7a'];
        this.buildings.push({
          x: bx0, y: by0, w: bw, h: bh,
          color: pick(rng, palette),
          roof: pick(rng, ['#5a5a5a', '#6a6a5a', '#7a6a6a', '#4a5a6a']),
          height: tall ? randInt(rng, 3, 6) : randInt(rng, 1, 3),
          district: d ? d.name : '',
        });
        if (rng() < 0.5) {
          this.trees.push({ x: x0 + randRange(rng, 10, w - 10), y: y0 + randRange(rng, 10, h - 10), r: randRange(rng, 8, 13) });
        }
      }
    }
    // Keep landmark tiles clear of buildings.
    for (const lm of Object.values(LANDMARKS)) {
      this.buildings = this.buildings.filter((b) => !(lm.x > b.x - 90 && lm.x < b.x + b.w + 90 && lm.y > b.y - 90 && lm.y < b.y + b.h + 90));
    }
  }

  /** True when a circle at (x,y,r) overlaps a building. */
  hitsBuilding(x, y, r) {
    for (const b of this.buildings) {
      if (x + r > b.x && x - r < b.x + b.w && y + r > b.y && y - r < b.y + b.h) return b;
    }
    return null;
  }

  /** Push a circle out of buildings; returns true if it was colliding. */
  resolveCollision(e, r) {
    let hit = false;
    for (const b of this.buildings) {
      if (e.x + r > b.x && e.x - r < b.x + b.w && e.y + r > b.y && e.y - r < b.y + b.h) {
        hit = true;
        const dxl = e.x + r - b.x;
        const dxr = b.x + b.w - (e.x - r);
        const dyt = e.y + r - b.y;
        const dyb = b.y + b.h - (e.y - r);
        const m = Math.min(dxl, dxr, dyt, dyb);
        if (m === dxl) e.x = b.x - r;
        else if (m === dxr) e.x = b.x + b.w + r;
        else if (m === dyt) e.y = b.y - r;
        else e.y = b.y + b.h + r;
      }
    }
    return hit;
  }

  /** A random point on a road, for spawning traffic and peds. */
  randomRoadPoint(rng) {
    const vertical = rng() < 0.5;
    const line = pick(rng, ROAD_LINES);
    const along = randRange(rng, 100, WORLD - 100);
    return vertical ? { x: line, y: along } : { x: along, y: line };
  }

  /** A random sidewalk point near (x,y) for pedestrians. */
  randomWalkPoint(rng, cx, cy, radius) {
    const p = this.randomRoadPoint(rng);
    return { x: clamp(p.x + randRange(rng, -60, 60), 60, WORLD - 60), y: clamp(p.y + randRange(rng, -60, 60), 60, WORLD - 60) };
  }
}
