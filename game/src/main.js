// VERANO HEAT — bootstrap and game loop. Owns the game state, the update
// step (movement, driving, combat, police, missions, shops, save/load) and
// the render call. Exposes window.__vh for automated play-testing.

import { clamp, dist, makeRng } from './util.js';
import { City, LANDMARKS, WORLD } from './city.js';
import { Input } from './input.js';
import { SoundBank } from './audio.js';
import { makeCar, seedTraffic, maintainTraffic, drivePlayerCar, updateTraffic, vehicleType } from './vehicles.js';
import { makePed, seedPeds, maintainPeds, updatePeds } from './pedestrians.js';
import { makeLoadout, currentWeapon, fireWeapon, updateBullets, meleeHit } from './weapons.js';
import { addWanted, decayWanted, maintainPolice, updatePolice, updateEnemyShots } from './police.js';
import { MISSIONS, startMission, updateMission, failMission, missionWaypoint } from './missions.js';
import { shopZones, zoneAt, shopMenu, updateRace } from './shops.js';
import { saveGame, loadGame, hasSave } from './save.js';
import { renderGame } from './render.js';
import { applyShot } from './shots.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const W = canvas.width;
const H = canvas.height;

const params = new URLSearchParams(location.search);
const rng = makeRng(Number(params.get('seed') || 7));

export function newState() {
  const city = new City();
  const state = {
    time: 0, mode: 'menu', rng,
    city, shopZones: shopZones(),
    sfx: new SoundBank(),
    input: new Input(canvas),
    player: {
      x: 1800, y: 2000, angle: -Math.PI / 2, aimAngle: -Math.PI / 2,
      health: 100, armor: 0, loadout: makeLoadout(), car: null, fireCd: 0,
    },
    cash: 500, wanted: 0, wantedTimer: 0,
    traffic: [], peds: [], parkedCars: [],
    policeCars: [], cops: [], heli: { active: false, x: 0, y: 0, angle: 0 },
    roadblock: null, enemyShots: [], bullets: [], particles: [], casings: [],
    mission: null, nextMission: 0, missionsDone: 0, standing: {},
    race: null, shop: null, briefing: null,
    toast: '', toastTimer: 0, flash: 0,
    busted: false, wasted: false, respawnTimer: 0,
    kills: 0, carsStolen: 0, racesWon: 0,
    saveRequested: false, hasSaveFlag: hasSave(),
    shotMode: false,
  };
  state.traffic = seedTraffic(city, rng, 14);
  state.peds = seedPeds(city, rng, 26);
  // A few parked cars near the start so the first steal is close by (on roads).
  for (const [type, x, y, a] of [['comet', 1900, 1800, 0], ['hatch', 1800, 2200, Math.PI / 2], ['taxi', 2200, 1800, Math.PI]]) {
    const car = makeCar(type, x, y, a, false);
    state.parkedCars.push(car);
  }
  return state;
}

const state = newState();

// ------------------------------------------------------------ camera helpers

function camera() {
  const p = state.player;
  const px = p.car ? p.car.x : p.x;
  const py = p.car ? p.car.y : p.y;
  return {
    x: clamp(px - W / 2, 0, WORLD - W),
    y: clamp(py - H / 2, 0, WORLD - H),
  };
}

// ------------------------------------------------------------ respawn

function respawn(kind) {
  const p = state.player;
  const spot = kind === 'busted' ? LANDMARKS.policeHQ : LANDMARKS.hospital;
  p.x = spot.x;
  p.y = spot.y;
  p.angle = -Math.PI / 2;
  p.health = 100;
  p.car = null;
  state.wanted = 0;
  state.cash = Math.floor(state.cash * 0.9);
  state.policeCars = [];
  state.cops = [];
  state.heli.active = false;
  state.roadblock = null;
  state.busted = false;
  state.wasted = false;
  state.respawnTimer = 0;
  if (state.mission) failMission(state, kind === 'busted' ? 'busted by the VPD' : 'wasted');
  state.saveRequested = true;
}

// ------------------------------------------------------------ combat helpers

function spawnParticles(x, y, color, n, speed) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = speed * (0.4 + Math.random() * 0.6);
    state.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.5 + Math.random() * 0.4, max: 0.9, r: 3 + Math.random() * 3, color });
  }
}

function playerShoot(dt) {
  const p = state.player;
  const input = state.input;
  p.fireCd -= dt;
  const w = currentWeapon(p.loadout);
  const wantFire = input.mouseDown && w.kind === 'gun' && p.fireCd <= 0;
  const wantMelee = input.mouseDown && w.kind === 'melee' && p.fireCd <= 0;
  if (!wantFire && !wantMelee) return;
  p.fireCd = w.rate;
  const cam = camera();
  const sx = p.car ? p.car.x : p.x;
  const sy = p.car ? p.car.y : p.y;
  const aim = p.aimAngle;
  if (w.kind === 'melee') {
    const targets = [...state.peds, ...state.cops, ...(state.mission ? state.mission.targets : [])];
    const hits = meleeHit(sx, sy, aim, targets, w.damage);
    for (const h of hits) applyHit(h.target, h.damage, h.x, h.y);
    spawnParticles(sx + Math.cos(aim) * 26, sy + Math.sin(aim) * 26, 'rgba(255,255,255,A)', 4, 120);
    return;
  }
  if (p.loadout.ammo[w.id] <= 0) {
    state.toast = `${w.name} is empty — visit Iron & Lead.`;
    state.toastTimer = 2;
    return;
  }
  const res = fireWeapon(p.loadout, sx, sy, aim, state.time);
  if (res.kind !== 'shot') return;
  state.bullets.push(...res.bullets);
  state.sfx.shot(w.id === 'shotgun' ? 'shotgun' : w.id === 'rifle' ? 'rifle' : w.id === 'smg' ? 'smg' : 'pistol');
  spawnParticles(sx + Math.cos(aim) * 30, sy + Math.sin(aim) * 30, 'rgba(255,220,120,A)', 5, 200);
  state.casings.push({ x: sx, y: sy, life: 1.2 });
  if (state.wanted < 1 && Math.random() < 0.6) addWanted(state, 1);
}

function applyHit(target, damage, x, y) {
  target.health -= damage;
  spawnParticles(x, y, 'rgba(200,40,30,A)', 6, 160);
  state.sfx.hit();
  if (target.health > 0) return;
  target.dead = true;
  state.kills++;
  if (target.police) {
    addWanted(state, 2);
    state.toast = 'You took down a cop — the VPD will remember that.';
    state.toastTimer = 3;
  } else if (target.kind === 'gang' || target.kind === 'boss') {
    const m = state.mission;
    if (m) m.killed++;
    state.cash += target.kind === 'boss' ? 1000 : 60;
    if (target.kind === 'boss') state.toast = 'EL TORO IS DOWN!';
    state.toastTimer = 3;
  } else if (target.kind === 'car') {
    spawnParticles(target.x, target.y, 'rgba(255,140,40,A)', 24, 320);
    state.cash += 150;
  } else {
    // A pedestrian.
    addWanted(state, 1);
  }
}

// ------------------------------------------------------------ interaction

function nearestEnterableCar(x, y, maxD) {
  let best = null;
  let bd = maxD;
  for (const c of [...state.traffic, ...state.parkedCars]) {
    if (c.dead) continue;
    const d = dist(x, y, c.x, c.y);
    if (d < bd) {
      bd = d;
      best = c;
    }
  }
  return best;
}

function interact() {
  const p = state.player;
  if (p.car) {
    // Exit the car.
    const car = p.car;
    p.car = null;
    p.x = car.x + Math.cos(car.angle + Math.PI / 2) * 34;
    p.y = car.y + Math.sin(car.angle + Math.PI / 2) * 34;
    p.angle = car.angle;
    car.speed = 0;
    if (!state.parkedCars.includes(car)) state.parkedCars.push(car);
    state.sfx.door();
    return;
  }
  // Shop zone?
  const zone = zoneAt(p.x, p.y);
  if (zone) {
    state.shop = zone;
    state.sfx.door();
    return;
  }
  // Mission marker at Mara's office?
  if (!state.mission && state.nextMission < MISSIONS.length && dist(p.x, p.y, LANDMARKS.marasOffice.x, LANDMARKS.marasOffice.y) < 90) {
    state.briefing = MISSIONS[state.nextMission];
    state.mode = 'briefing';
    state.sfx.mission();
    return;
  }
  // Steal / enter a car.
  const car = nearestEnterableCar(p.x, p.y, 64);
  if (car) {
    const wasTraffic = state.traffic.includes(car);
    if (wasTraffic) {
      state.traffic = state.traffic.filter((c) => c !== car);
      state.carsStolen++;
      addWanted(state, 1);
      state.toast = `You stole a ${car.name}! The owner called it in.`;
      state.toastTimer = 3;
    } else {
      state.parkedCars = state.parkedCars.filter((c) => c !== car);
      state.toast = `You hop into the ${car.name}.`;
      state.toastTimer = 2;
    }
    p.car = car;
    car.traffic = false;
    state.sfx.door();
  }
}

// ------------------------------------------------------------ mission targets

function updateMissionTargets(dt) {
  const m = state.mission;
  if (!m) return;
  const p = state.player;
  for (const t of m.targets) {
    if (t.dead) continue;
    if (t.kind === 'gang' || t.kind === 'boss') {
      const d = dist(t.x, t.y, p.x, p.y);
      t.angle = Math.atan2(p.y - t.y, p.x - t.x);
      if (d < 420 && d > 60) {
        const probe = { x: t.x + Math.cos(t.angle) * t.speed * dt, y: t.y + Math.sin(t.angle) * t.speed * dt };
        state.city.resolveCollision(probe, 12);
        t.x = probe.x;
        t.y = probe.y;
      }
      t.shootCd -= dt;
      if (d < 380 && t.shootCd <= 0) {
        t.shootCd = 1.6;
        state.enemyShots.push({ x: t.x, y: t.y, angle: t.angle + (Math.random() - 0.5) * 0.25, damage: 5 });
      }
    } else if (t.kind === 'car') {
      // Rico flees from the player.
      const d = dist(t.x, t.y, p.x, p.y);
      const flee = Math.atan2(t.y - p.y, t.x - p.x);
      let ta = flee;
      if (d < 200) ta = flee;
      else ta = t.angle + Math.sin(state.time * 0.7 + t.x) * 0.5;
      t.angle += clamp(ta - t.angle, -dt * 2, dt * 2);
      t.speed = Math.min(300, (t.speed || 0) + 200 * dt);
      t.x += Math.cos(t.angle) * t.speed * dt;
      t.y += Math.sin(t.angle) * t.speed * dt;
      t.x = clamp(t.x, 40, WORLD - 40);
      t.y = clamp(t.y, 40, WORLD - 40);
      const probe = { x: t.x, y: t.y };
      if (state.city.resolveCollision(probe, 22)) {
        t.x = probe.x;
        t.y = probe.y;
        t.angle += Math.PI / 2;
        t.speed *= 0.4;
      }
    }
  }
}

// ------------------------------------------------------------ update

function update(dt) {
  state.time += dt;
  const p = state.player;
  const input = state.input;
  state.toastTimer = Math.max(0, state.toastTimer - dt);
  state.flash = Math.max(0, state.flash - dt);
  if (state.saveRequested) {
    state.saveRequested = false;
    saveGame(state);
  }
  // Busted / wasted countdown.
  if (state.busted || state.wasted) {
    state.respawnTimer -= dt;
    if (state.respawnTimer <= 0) respawn(state.busted ? 'busted' : 'wasted');
    return;
  }
  // Aim from the mouse.
  const cam = camera();
  const wx = cam.x + input.mouseX;
  const wy = cam.y + input.mouseY;
  const ax = p.car ? p.car.x : p.x;
  const ay = p.car ? p.car.y : p.y;
  p.aimAngle = Math.atan2(wy - ay, wx - ax);
  // Movement.
  if (p.car) {
    // In a staged screenshot pose the car keeps driving itself.
    if (state.shotMode) input.up = true;
    drivePlayerCar(p.car, input, dt, state.city, state.sfx);
    p.x = p.car.x;
    p.y = p.car.y;
    p.angle = p.car.angle;
    if (p.car.health <= 0) {
      spawnParticles(p.car.x, p.car.y, 'rgba(255,140,40,A)', 26, 340);
      p.car.dead = true;
      p.car = null;
      p.health -= 20;
      addWanted(state, 1);
    }
  } else {
    const speed = input.sprint ? 330 : 220;
    let mx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    let my = (input.down ? 1 : 0) - (input.up ? 1 : 0);
    if (mx !== 0 || my !== 0) {
      const len = Math.hypot(mx, my);
      mx /= len;
      my /= len;
      p.angle = Math.atan2(my, mx);
      const nx = p.x + mx * speed * dt;
      const ny = p.y + my * speed * dt;
      const probe = { x: nx, y: ny };
      state.city.resolveCollision(probe, 12);
      p.x = clamp(probe.x, 30, WORLD - 30);
      p.y = clamp(probe.y, 30, WORLD - 30);
    }
  }
  // Combat.
  playerShoot(dt);
  const bulletTargets = [
    ...state.peds, ...state.cops,
    ...(state.mission ? state.mission.targets : []),
    ...state.traffic, ...state.parkedCars,
  ];
  const hits = updateBullets(state.bullets, dt, state.city, bulletTargets);
  for (const h of hits) {
    const t = h.target;
    if (state.traffic.includes(t) || state.parkedCars.includes(t)) {
      t.health -= h.damage;
      if (t.health <= 0 && !t.dead) {
        t.dead = true;
        spawnParticles(t.x, t.y, 'rgba(255,140,40,A)', 26, 340);
        state.sfx.crash();
        addWanted(state, 1);
      }
    } else {
      applyHit(t, h.damage, h.x, h.y);
    }
  }
  state.bullets = state.bullets.filter((b) => !b.dead);
  // Mission targets act.
  updateMissionTargets(dt);
  // Police.
  maintainPolice(state, dt, rng);
  const seen = updatePolice(state, dt, state.city);
  if (state.busted && state.respawnTimer <= 0) state.respawnTimer = 2.5;
  decayWanted(state, dt, seen);
  updateEnemyShots(state, dt, state.city);
  // World life.
  updateTraffic(state.traffic, dt, state.city, state, rng);
  maintainTraffic(state.city, state.traffic, p.x, p.y, rng, 14);
  const danger = state.bullets.length > 0 ? { x: p.x, y: p.y } : null;
  updatePeds(state.peds, dt, state.city, danger, rng);
  maintainPeds(state.city, state.peds, p.x, p.y, rng, 26);
  // Particles / casings.
  for (const fx of state.particles) {
    fx.life -= dt;
    fx.x += fx.vx * dt;
    fx.y += fx.vy * dt;
    fx.vx *= 0.96;
    fx.vy *= 0.96;
  }
  state.particles = state.particles.filter((f) => f.life > 0);
  for (const c of state.casings) c.life -= dt;
  state.casings = state.casings.filter((c) => c.life > 0);
  // Missions and race.
  updateMission(state, dt);
  const rResult = updateRace(state, dt);
  if (rResult === 'win') state.racesWon++;
  // Player down?
  if (p.health <= 0 && !state.shotMode) {
    state.wasted = true;
    state.respawnTimer = 2.5;
    state.sfx.fail();
  }
  // Radio + engine audio.
  const speed01 = p.car ? clamp(Math.abs(p.car.speed) / 560, 0, 1) : 0;
  state.sfx.update(dt, speed01, state.wanted);
}

// ------------------------------------------------------------ mode input

function handleKeys() {
  const input = state.input;
  const p = state.player;
  if (input.wasPressed('m')) state.sfx.setMuted(!state.sfx.muted);
  if (state.mode === 'menu') {
    if (input.wasPressed('enter')) {
      state.mode = 'playing';
      state.sfx.unlock();
      state.sfx.mission();
    }
    if (input.wasPressed('l') && state.hasSaveFlag) {
      applySave(loadGame());
      state.mode = 'playing';
      state.sfx.unlock();
    }
    return;
  }
  if (state.mode === 'briefing') {
    if (input.wasPressed('enter')) {
      const idx = state.nextMission;
      state.briefing = null;
      state.mode = 'playing';
      startMission(state, idx);
    }
    if (input.wasPressed('escape')) {
      state.briefing = null;
      state.mode = 'playing';
    }
    return;
  }
  if (state.shop) {
    if (input.wasPressed('e') || input.wasPressed('escape')) {
      state.shop = null;
      return;
    }
    const lines = shopMenu(state, state.shop);
    for (const l of lines) {
      if (l.key && input.wasPressed(l.key) && l.action) l.action();
    }
    return;
  }
  if (input.wasPressed('p') || input.wasPressed('escape')) {
    state.mode = state.mode === 'paused' ? 'playing' : 'paused';
    return;
  }
  if (state.mode === 'paused') {
    if (input.wasPressed('f5')) {
      saveGame(state);
      state.toast = 'Game saved.';
      state.toastTimer = 2;
    }
    if (input.wasPressed('f9')) {
      const data = loadGame();
      if (data) {
        applySave(data);
        state.toast = 'Game loaded.';
        state.toastTimer = 2;
      }
    }
    return;
  }
  if (input.wasPressed('e')) interact();
  if (input.wasPressed('r')) {
    state.sfx.setStation(state.sfx.station + 1);
    state.toast = `Radio: ${state.sfx.stationName()}`;
    state.toastTimer = 2;
  }
  if (input.wasPressed('f5')) {
    saveGame(state);
    state.toast = 'Game saved.';
    state.toastTimer = 2;
  }
  if (input.wasPressed('f9')) {
    const data = loadGame();
    if (data) {
      applySave(data);
      state.toast = 'Game loaded.';
      state.toastTimer = 2;
    }
  }
  // Weapon select 1-5.
  for (let i = 0; i < 5; i++) {
    if (input.wasPressed(String(i + 1)) && p.loadout.owned[i]) {
      p.loadout.selected = i;
    }
  }
}

/** Apply a loaded save onto the live state. */
function applySave(data) {
  if (!data) return;
  const p = state.player;
  state.cash = data.cash;
  state.missionsDone = data.missionsDone;
  state.nextMission = data.nextMission;
  state.standing = data.standing || {};
  state.racesWon = data.racesWon || 0;
  state.kills = data.kills || 0;
  state.carsStolen = data.carsStolen || 0;
  p.x = data.player.x;
  p.y = data.player.y;
  p.angle = data.player.angle;
  p.health = data.player.health;
  p.armor = data.player.armor;
  p.loadout = data.player.loadout;
  p.car = null;
  if (data.player.car) {
    const c = data.player.car;
    const car = makeCar(c.type, c.x, c.y, c.angle, false);
    car.engine = c.engine || 0;
    car.armor = c.armor || 0;
    car.tires = c.tires || 0;
    car.health = c.health ?? 100;
    car.color = c.color || car.color;
    p.car = car;
  }
  state.wanted = 0;
  state.mission = null;
  state.race = null;
  state.shop = null;
}

// ------------------------------------------------------------ shot poses

const shotName = params.get('shot');
if (shotName) {
  state.shotMode = true;
  applyShot(state, shotName);
}

// ------------------------------------------------------------ main loop

let last = performance.now();
function frame(now) {
  const dt = clamp((now - last) / 1000, 0, 0.05);
  last = now;
  state.sfx.unlock();
  handleKeys();
  if (state.mode === 'playing' && !state.shop) update(dt);
  else if (state.mode === 'playing' && state.shop) {
    // Shop open: world frozen, but keep the music going.
    state.sfx.update(dt, 0, state.wanted);
  }
  renderGame(ctx, state, W, H);
  state.input.endFrame();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ------------------------------------------------------------ test hooks

window.__vh = {
  state,
  start: () => { state.mode = 'playing'; },
  startMission: (i) => startMission(state, i),
  teleport: (x, y) => {
    if (state.player.car) {
      state.player.car.x = x;
      state.player.car.y = y;
    }
    state.player.x = x;
    state.player.y = y;
  },
  setWanted: (n) => { state.wanted = n; },
  giveCar: (type) => {
    const car = makeCar(type || 'viento', state.player.x + 40, state.player.y, 0, false);
    state.parkedCars.push(car);
    return car;
  },
  waypoint: () => missionWaypoint(state),
  saveNow: () => saveGame(state),
  loadNow: () => { const d = loadGame(); if (d) applySave(d); return !!d; },
  damage: (n) => { state.player.health -= n; },
  missionResult: () => (state.mission ? state.mission.def.id : state.missionsDone),
};
window.__vhReady = true;
