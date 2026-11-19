// Rendering for VERANO HEAT: the city, the actors, the effects, the HUD
// (health, cash, wanted stars, minimap, objective, radio, speed), and every
// menu screen. All canvas 2D, all drawn from game state.

import { clamp, dist, lerp, money, clock } from './util.js';
import { DISTRICTS, LANDMARKS, ROAD_LINES, ROAD_W, WORLD, districtAt } from './city.js';
import { missionObjective, missionWaypoint } from './missions.js';
import { shopMenu } from './shops.js';
import { currentWeapon } from './weapons.js';
import { RADIO_STATIONS } from './audio.js';

const TAU = Math.PI * 2;

/** Draw the whole frame for `state` into ctx (canvas w x h). */
export function renderGame(ctx, state, w, h) {
  const p = state.player;
  const px = p.car ? p.car.x : p.x;
  const py = p.car ? p.car.y : p.y;
  const camX = clamp(px - w / 2, 0, WORLD - w);
  const camY = clamp(py - h / 2, 0, WORLD - h);
  drawWorld(ctx, state, camX, camY, w, h);
  drawEntities(ctx, state, camX, camY);
  drawEffects(ctx, state, camX, camY);
  if (state.mode === 'menu') drawTitle(ctx, state, w, h);
  else {
    drawHUD(ctx, state, w, h);
    drawMinimap(ctx, state, w, h);
    if (state.mode === 'paused') drawPause(ctx, state, w, h);
    if (state.mode === 'briefing') drawBriefing(ctx, state, w, h);
    if (state.shop) drawShop(ctx, state, w, h);
    if (state.input.wheelHeld && state.mode === 'playing') drawWeaponWheel(ctx, state, w, h);
    if (state.busted) drawBusted(ctx, w, h, 'BUSTED', 'The VPD hauled you in. Cash lost, heat cleared.');
    if (state.wasted) drawBusted(ctx, w, h, 'WASTED', 'You blacked out. Verano General patched you up — for a fee.');
  }
  // Damage flash and sun-soaked warmth.
  if (state.flash > 0) {
    ctx.fillStyle = `rgba(255,40,30,${clamp(state.flash, 0, 0.35)})`;
    ctx.fillRect(0, 0, w, h);
  }
  const warm = ctx.createRadialGradient(w / 2, h * 0.3, 80, w / 2, h / 2, Math.max(w, h) * 0.75);
  warm.addColorStop(0, 'rgba(255,220,140,0.05)');
  warm.addColorStop(1, 'rgba(20,30,60,0.10)');
  ctx.fillStyle = warm;
  ctx.fillRect(0, 0, w, h);
}

// --------------------------------------------------------------- world

function drawWorld(ctx, state, camX, camY, w, h) {
  const city = state.city;
  // Ground: district tints.
  ctx.fillStyle = '#5a7a4a';
  ctx.fillRect(0, 0, w, h);
  for (const d of DISTRICTS) {
    const x = d.x - camX;
    const y = d.y - camY;
    if (x > w || y > h || x + d.w < 0 || y + d.h < 0) continue;
    ctx.fillStyle = d.name === 'Beachfront' ? '#d8c08a' : shadeDistrict(d.tint);
    ctx.fillRect(x, y, d.w, d.h);
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.font = 'bold 26px system-ui, sans-serif';
    ctx.fillText(d.name.toUpperCase(), x + 24, y + 44);
    ctx.font = '14px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fillText(d.desc, x + 24, y + 66);
  }
  // Parks / sand / water.
  for (const pk of city.parks) {
    const x = pk.x - camX;
    const y = pk.y - camY;
    if (x > w || y > h || x + pk.w < 0 || y + pk.h < 0) continue;
    ctx.fillStyle = pk.kind === 'sand' ? '#e8d49a' : pk.kind === 'water' ? '#2a6a8a' : '#4a7a3a';
    ctx.fillRect(x, y, pk.w, pk.h);
    if (pk.kind === 'water') {
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(x + 10, y + 30 + i * 60);
        ctx.bezierCurveTo(x + pk.w * 0.3, y + 20 + i * 60, x + pk.w * 0.6, y + 42 + i * 60, x + pk.w - 10, y + 30 + i * 60);
        ctx.stroke();
      }
    }
  }
  // Roads.
  ctx.fillStyle = '#2e3138';
  for (const l of ROAD_LINES) {
    const vx = l - camX;
    if (vx > -ROAD_W && vx < w + ROAD_W) ctx.fillRect(vx - ROAD_W / 2, -camY, ROAD_W, WORLD);
    const hy = l - camY;
    if (hy > -ROAD_W && hy < h + ROAD_W) ctx.fillRect(-camX, hy - ROAD_W / 2, WORLD, ROAD_W);
  }
  // Lane dashes.
  ctx.fillStyle = 'rgba(255,220,90,0.75)';
  for (const l of ROAD_LINES) {
    const vx = l - camX;
    if (vx > 0 && vx < w) {
      for (let y = Math.floor(camY / 60) * 60; y < camY + h; y += 60) {
        ctx.fillRect(vx - 2, y - camY, 4, 26);
      }
    }
    const hy = l - camY;
    if (hy > 0 && hy < h) {
      for (let x = Math.floor(camX / 60) * 60; x < camX + w; x += 60) {
        ctx.fillRect(x - camX, hy - 2, 26, 4);
      }
    }
  }
  // Buildings with roof detail and height shadow.
  for (const b of city.buildings) {
    const x = b.x - camX;
    const y = b.y - camY;
    if (x > w || y > h || x + b.w < 0 || y + b.h < 0) continue;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(x + 5, y + 5 + b.height * 2, b.w, b.h);
    ctx.fillStyle = b.color;
    ctx.fillRect(x, y, b.w, b.h);
    ctx.fillStyle = b.roof;
    ctx.fillRect(x + 6, y + 6, b.w - 12, b.h - 12);
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 6.5, y + 6.5, b.w - 13, b.h - 13);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(x + b.w / 2 - 8, y + b.h / 2 - 8, 16, 16);
  }
  // Trees.
  for (const t of city.trees) {
    const x = t.x - camX;
    const y = t.y - camY;
    if (x < -20 || y < -20 || x > w + 20 || y > h + 20) continue;
    ctx.fillStyle = '#2e6a2e';
    ctx.beginPath();
    ctx.arc(x, y, t.r, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#4a9a3a';
    ctx.beginPath();
    ctx.arc(x - 3, y - 3, t.r * 0.6, 0, TAU);
    ctx.fill();
  }
  // Landmark labels.
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.textAlign = 'left';
  for (const lm of Object.values(LANDMARKS)) {
    const x = lm.x - camX;
    const y = lm.y - camY;
    if (x < -120 || y < -20 || x > w + 120 || y > h + 20) continue;
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    const tw = ctx.measureText(lm.label).width + 12;
    roundRect(ctx, x - 6, y - 22, tw, 18, 4);
    ctx.fill();
    ctx.fillStyle = '#ffe9a0';
    ctx.fillText(lm.label, x, y - 9);
  }
  // Mission start marker (M) when no mission is active.
  if (!state.mission && state.nextMission < 12) {
    const m = LANDMARKS.marasOffice;
    const x = m.x - camX;
    const y = m.y - camY;
    drawMarker(ctx, x, y, '#ffd23d', 'M');
  }
  // Mission waypoint marker.
  const wp = missionWaypoint(state);
  if (wp) {
    const x = wp.x - camX;
    const y = wp.y - camY;
    drawMarker(ctx, x, y, '#ffd23d', '◆');
  }
  // Race checkpoints.
  if (state.race) {
    const pt = state.race.points[state.race.checkpoint];
    if (pt) drawMarker(ctx, pt.x - camX, pt.y - camY, '#2dd4ff', '◆');
  }
  // Shop zones.
  if (state.mode === 'playing') {
    for (const z of state.shopZones) {
      const x = z.x - camX;
      const y = z.y - camY;
      if (x < -40 || y < -40 || x > w + 40 || y > h + 40) continue;
      ctx.fillStyle = z.kind === 'guns' ? '#ff6a4a' : z.kind === 'garage' ? '#4ad9ff' : z.kind === 'safehouse' ? '#7aff6a' : z.kind === 'food' ? '#ffb84a' : '#ff4ad9';
      ctx.beginPath();
      ctx.arc(x, y, 12, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#111';
      ctx.font = 'bold 11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(z.kind === 'guns' ? 'G' : z.kind === 'garage' ? 'W' : z.kind === 'safehouse' ? 'H' : z.kind === 'food' ? 'F' : 'R', x, y + 4);
      ctx.textAlign = 'left';
    }
  }
}

function shadeDistrict(tint) {
  // Darken a district tint into a ground tone.
  const n = parseInt(tint.slice(1), 16);
  const r = ((n >> 16) & 255) * 0.45 + 60;
  const g = ((n >> 8) & 255) * 0.45 + 60;
  const b = (n & 255) * 0.45 + 55;
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

function drawMarker(ctx, x, y, color, glyph) {
  const bob = Math.sin(Date.now() / 280) * 4;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y - 26 + bob);
  ctx.lineTo(x + 12, y - 8 + bob);
  ctx.lineTo(x - 12, y - 8 + bob);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#111';
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(glyph, x, y - 10 + bob);
  ctx.textAlign = 'left';
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// --------------------------------------------------------------- entities

function drawEntities(ctx, state, camX, camY) {
  // Mission targets (crates / pickups).
  const m = state.mission;
  if (m) {
    const step = m.def.steps[m.step];
    if (step && (step.kind === 'collect' || step.kind === 'race')) {
      const pts = step.points;
      const idx = step.kind === 'collect' ? m.collected : m.checkpoint;
      pts.forEach((pt, i) => {
        if (i < idx) return;
        const x = pt.x - camX;
        const y = pt.y - camY;
        ctx.fillStyle = i === idx ? '#ffd23d' : '#8a8a8a';
        ctx.fillRect(x - 12, y - 12, 24, 24);
        ctx.strokeStyle = '#111';
        ctx.lineWidth = 2;
        ctx.strokeRect(x - 12, y - 12, 24, 24);
      });
    }
    for (const t of m.targets) {
      if (t.dead) continue;
      const x = t.x - camX;
      const y = t.y - camY;
      if (t.kind === 'gang' || t.kind === 'boss') drawPerson(ctx, x, y, t.angle || 0, '#a03d2d', '#2a2a2a', t.kind === 'boss');
      else if (t.kind === 'car') drawCar(ctx, x, y, t.angle || 0, t, '#7a2a2a');
      else if (t.kind === 'parkedCar') drawCar(ctx, x, y, 0.4, { w: 46, h: 21, color: '#c92d7a' }, '#c92d7a');
      if (t.health !== undefined && t.health < (t.kind === 'boss' ? 220 : t.kind === 'car' ? 160 : 55)) {
        drawBar(ctx, x - 18, y - 30, 36, 5, t.health / (t.kind === 'boss' ? 220 : t.kind === 'car' ? 160 : 55), '#ff4a3d');
      }
      if (t.kind === 'boss') {
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 12px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('EL TORO', x, y - 34);
        ctx.textAlign = 'left';
      }
    }
  }
  // Traffic and police cars.
  for (const car of state.traffic) {
    if (car.dead) continue;
    drawCar(ctx, car.x - camX, car.y - camY, car.angle, car, car.color);
  }
  for (const car of state.policeCars) {
    if (car.dead) continue;
    drawCar(ctx, car.x - camX, car.y - camY, car.angle, car, '#20242e', true);
  }
  // Roadblock.
  if (state.roadblock) {
    const rb = state.roadblock;
    for (const off of [-46, 46]) {
      const x = rb.x + Math.cos(rb.angle) * off - camX;
      const y = rb.y + Math.sin(rb.angle) * off - camY;
      drawCar(ctx, x, y, rb.angle, { w: 46, h: 22, color: '#20242e' }, '#20242e', true);
    }
    ctx.fillStyle = '#ff4a3d';
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('ROADBLOCK', rb.x - camX, rb.y - camY - 30);
    ctx.textAlign = 'left';
  }
  // Foot cops.
  for (const cop of state.cops) {
    if (cop.dead) continue;
    drawPerson(ctx, cop.x - camX, cop.y - camY, cop.angle, '#20242e', '#3a4a6a', false, true);
  }
  // Pedestrians.
  for (const ped of state.peds) {
    if (ped.dead) continue;
    drawPerson(ctx, ped.x - camX, ped.y - camY, ped.angle, ped.shirt, ped.pants, false);
  }
  // Helicopter shadow + body.
  if (state.heli.active) {
    const hx = state.heli.x - camX;
    const hy = state.heli.y - camY;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(hx + 26, hy + 34, 26, 12, 0, 0, TAU);
    ctx.fill();
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(Math.sin(Date.now() / 500) * 0.1);
    ctx.fillStyle = '#20242e';
    ctx.fillRect(-22, -9, 44, 18);
    ctx.fillStyle = '#9ad9ff';
    ctx.fillRect(8, -6, 10, 12);
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-30, 0);
    ctx.lineTo(30, 0);
    ctx.stroke();
    ctx.restore();
    // Spotlight cone on the player.
    const px = state.player.x - camX;
    const py = state.player.y - camY;
    const grad = ctx.createRadialGradient(px, py, 4, px, py, 90);
    grad.addColorStop(0, 'rgba(255,255,200,0.28)');
    grad.addColorStop(1, 'rgba(255,255,200,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(px, py, 90, 0, TAU);
    ctx.fill();
  }
  // Player car or player on foot.
  const p = state.player;
  if (p.car) {
    drawCar(ctx, p.car.x - camX, p.car.y - camY, p.car.angle, p.car, p.car.color);
    if (p.car.smoke > 0.1) {
      ctx.fillStyle = `rgba(120,120,120,${p.car.smoke * 0.5})`;
      ctx.beginPath();
      ctx.arc(p.car.x - camX - Math.cos(p.car.angle) * 24, p.car.y - camY - Math.sin(p.car.angle) * 24, 14 + Math.random() * 8, 0, TAU);
      ctx.fill();
    }
  } else {
    drawPerson(ctx, p.x - camX, p.y - camY, p.aimAngle, '#ffcf4a', '#2a4a6a', false, false, true);
  }
  // Bullets and enemy shots.
  ctx.fillStyle = '#ffe9a0';
  for (const b of state.bullets) {
    if (b.dead) continue;
    ctx.fillRect(b.x - camX - 2, b.y - camY - 2, 4, 4);
  }
  ctx.fillStyle = '#ff6a4a';
  for (const s of state.enemyShots) {
    if (s.dead) continue;
    ctx.beginPath();
    ctx.arc(s.x - camX, s.y - camY, 3, 0, TAU);
    ctx.fill();
  }
  // Aim line on foot.
  if (!p.car && state.mode === 'playing') {
    const w = currentWeapon(p.loadout);
    if (w.kind === 'gun') {
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(p.x - camX, p.y - camY);
      ctx.lineTo(p.x - camX + Math.cos(p.aimAngle) * 60, p.y - camY + Math.sin(p.aimAngle) * 60);
      ctx.stroke();
    }
  }
}

function drawCar(ctx, x, y, angle, car, color, police) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  const w = car.w || 44;
  const h = car.h || 22;
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(-w / 2 + 3, -h / 2 + 3, w, h);
  ctx.fillStyle = color;
  roundRect(ctx, -w / 2, -h / 2, w, h, 6);
  ctx.fill();
  ctx.fillStyle = 'rgba(160,220,255,0.85)';
  ctx.fillRect(-w * 0.18, -h / 2 + 3, w * 0.22, h - 6);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(w / 2 - 8, -h / 2 + 2, 4, h - 4);
  if (police) {
    ctx.fillStyle = '#fff';
    ctx.fillRect(-w * 0.32, -h / 2 + 2, w * 0.12, h - 4);
    ctx.fillStyle = '#ff3d2d';
    ctx.fillRect(-4, -h / 2 - 2, 8, 4);
    ctx.fillStyle = '#2d6aff';
    ctx.fillRect(-4, h / 2 - 2, 8, 4);
  }
  ctx.fillStyle = '#ffe9a0';
  ctx.fillRect(w / 2 - 2, -h / 2 + 3, 2, 5);
  ctx.fillRect(w / 2 - 2, h / 2 - 8, 2, 5);
  ctx.restore();
}

function drawPerson(ctx, x, y, angle, shirt, pants, big, cop, hero) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  const s = big ? 1.25 : 1;
  // Shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(1, 2, 11 * s, 9 * s, 0, 0, TAU);
  ctx.fill();
  // Legs, body, head, gun arm.
  ctx.fillStyle = pants;
  ctx.fillRect(-7 * s, -7 * s, 10 * s, 5 * s);
  ctx.fillRect(-7 * s, 2 * s, 10 * s, 5 * s);
  ctx.fillStyle = shirt;
  ctx.fillRect(-9 * s, -8 * s, 16 * s, 16 * s);
  ctx.fillStyle = cop ? '#d9d9d9' : '#e8b88a';
  ctx.beginPath();
  ctx.arc(7 * s, 0, 6.5 * s, 0, TAU);
  ctx.fill();
  if (cop) {
    ctx.fillStyle = '#20242e';
    ctx.beginPath();
    ctx.arc(7 * s, 0, 7 * s, Math.PI, TAU);
    ctx.fill();
  }
  if (hero) {
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 13 * s, 0, TAU);
    ctx.stroke();
  }
  ctx.restore();
}

function drawBar(ctx, x, y, w, h, frac, color) {
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w * clamp(frac, 0, 1), h);
}

// --------------------------------------------------------------- effects

function drawEffects(ctx, state, camX, camY) {
  for (const fx of state.particles) {
    const a = clamp(fx.life / fx.max, 0, 1);
    ctx.fillStyle = fx.color.replace('A', String(a));
    ctx.beginPath();
    ctx.arc(fx.x - camX, fx.y - camY, fx.r * a + 1, 0, TAU);
    ctx.fill();
  }
  for (const c of state.casings) {
    ctx.fillStyle = '#d9b84a';
    ctx.fillRect(c.x - camX, c.y - camY, 3, 2);
  }
}

// --------------------------------------------------------------- HUD

function drawHUD(ctx, state, w, h) {
  const p = state.player;
  // Top-left: health + armor.
  ctx.textAlign = 'left';
  panel(ctx, 12, 12, 250, 64);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.fillText('DARIO CRUZ', 22, 30);
  drawBar(ctx, 22, 38, 150, 10, p.health / 100, '#4ad94a');
  drawBar(ctx, 22, 52, 150, 6, p.armor / 100, '#4aa8d9');
  ctx.fillStyle = '#cfe8ff';
  ctx.font = '12px system-ui, sans-serif';
  ctx.fillText(`${Math.ceil(p.health)} HP`, 178, 47);
  ctx.fillText(`${Math.ceil(p.armor)} ARM`, 178, 59);
  // Cash + district.
  panel(ctx, 12, 84, 250, 44);
  ctx.fillStyle = '#7aff6a';
  ctx.font = 'bold 18px system-ui, sans-serif';
  ctx.fillText(money(state.cash), 22, 105);
  const d = districtAt(p.x, p.y);
  ctx.fillStyle = '#cfe8ff';
  ctx.font = '12px system-ui, sans-serif';
  ctx.fillText(d ? d.name : 'Port Verano', 22, 122);
  // Wanted stars top-right.
  panel(ctx, w - 232, 12, 220, 58);
  ctx.fillStyle = '#ffb84a';
  ctx.font = 'bold 20px system-ui, sans-serif';
  let stars = '';
  for (let i = 0; i < 5; i++) stars += i < state.wanted ? '★' : '☆';
  ctx.fillText(stars, w - 222, 38);
  ctx.fillStyle = '#cfe8ff';
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillText(state.wanted > 0 ? 'Lose the cops to cool off' : 'Stay out of trouble', w - 222, 56);
  // Objective top-center.
  const obj = missionObjective(state);
  if (obj) {
    const tw = 520;
    panel(ctx, w / 2 - tw / 2, 12, tw, 58);
    ctx.fillStyle = '#ffd23d';
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(obj.title, w / 2, 32);
    ctx.fillStyle = '#fff';
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillText(obj.label + (obj.timer ? `  —  ${clock(obj.timer)}` : ''), w / 2, 52);
    ctx.textAlign = 'left';
  } else if (state.race) {
    const tw = 460;
    panel(ctx, w / 2 - tw / 2, 12, tw, 58);
    ctx.fillStyle = '#2dd4ff';
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('BOARDWALK RACE', w / 2, 32);
    ctx.fillStyle = '#fff';
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillText(`Checkpoint ${state.race.checkpoint + 1}/${state.race.points.length}  —  ${clock(state.race.timer)}`, w / 2, 52);
    ctx.textAlign = 'left';
  }
  // Toast.
  if (state.toastTimer > 0) {
    ctx.font = 'bold 15px system-ui, sans-serif';
    const tw = Math.min(640, ctx.measureText(state.toast).width + 32);
    panel(ctx, w / 2 - tw / 2, 82, tw, 34);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.fillText(state.toast, w / 2, 104);
    ctx.textAlign = 'left';
  }
  // Bottom-right: weapon, speed, radio.
  const w0 = currentWeapon(p.loadout);
  panel(ctx, w - 262, h - 118, 250, 106);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 14px system-ui, sans-serif';
  ctx.fillText(w0.name, w - 250, h - 96);
  ctx.fillStyle = '#cfe8ff';
  ctx.font = '12px system-ui, sans-serif';
  ctx.fillText(w0.kind === 'melee' ? 'Melee' : `Ammo ${p.loadout.ammo[w0.id] === Infinity ? '∞' : p.loadout.ammo[w0.id]}`, w - 250, h - 78);
  if (p.car) {
    const kmh = Math.round(Math.abs(p.car.speed) * 0.32);
    ctx.fillStyle = '#ffd23d';
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.fillText(`${kmh} km/h`, w - 250, h - 52);
    ctx.fillStyle = '#cfe8ff';
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillText(`${p.car.name}  ·  HP ${Math.max(0, Math.ceil(p.car.health))}`, w - 250, h - 34);
  } else {
    ctx.fillStyle = '#cfe8ff';
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillText('On foot — press E near a car to steal it', w - 250, h - 52);
  }
  const st = RADIO_STATIONS[state.sfx.station];
  ctx.fillStyle = '#ff9ad9';
  ctx.font = 'bold 12px system-ui, sans-serif';
  ctx.fillText(`♪ ${st.name} — ${st.style} (R to change)`, w - 250, h - 18);
  // Controls hint is in the page footer; keep the bottom strip clean.
  // Mission progress.
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.font = '12px system-ui, sans-serif';
  ctx.fillText(`Missions ${state.missionsDone}/12  ·  Next: ${state.nextMission < 12 ? 'M' + (state.nextMission + 1) + ' at Mara\'s Office' : 'Story complete!'}`, 12, h - 10);
}

function panel(ctx, x, y, w, h) {
  ctx.fillStyle = 'rgba(8,14,22,0.72)';
  roundRect(ctx, x, y, w, h, 8);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

// --------------------------------------------------------------- minimap

function drawMinimap(ctx, state, w, h) {
  const size = 168;
  const x0 = 14;
  const y0 = h - size - 26;
  const scale = size / WORLD;
  ctx.save();
  ctx.beginPath();
  ctx.arc(x0 + size / 2, y0 + size / 2, size / 2, 0, TAU);
  ctx.clip();
  ctx.fillStyle = '#1a2a1a';
  ctx.fillRect(x0, y0, size, size);
  for (const d of DISTRICTS) {
    ctx.fillStyle = d.tint;
    ctx.globalAlpha = 0.5;
    ctx.fillRect(x0 + d.x * scale, y0 + d.y * scale, d.w * scale, d.h * scale);
    ctx.globalAlpha = 1;
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 1;
  for (const l of ROAD_LINES) {
    ctx.beginPath();
    ctx.moveTo(x0 + l * scale, y0);
    ctx.lineTo(x0 + l * scale, y0 + size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x0, y0 + l * scale);
    ctx.lineTo(x0 + size, y0 + l * scale);
    ctx.stroke();
  }
  // Waypoint.
  const wp = missionWaypoint(state);
  if (wp) {
    ctx.fillStyle = '#ffd23d';
    ctx.beginPath();
    ctx.arc(x0 + wp.x * scale, y0 + wp.y * scale, 5, 0, TAU);
    ctx.fill();
  }
  // Police blips.
  ctx.fillStyle = '#2d6aff';
  for (const c of state.policeCars) {
    ctx.beginPath();
    ctx.arc(x0 + c.x * scale, y0 + c.y * scale, 3, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = '#ff4a3d';
  for (const c of state.cops) {
    ctx.beginPath();
    ctx.arc(x0 + c.x * scale, y0 + c.y * scale, 2.5, 0, TAU);
    ctx.fill();
  }
  // Player arrow.
  const p = state.player;
  const px = x0 + (p.car ? p.car.x : p.x) * scale;
  const py = y0 + (p.car ? p.car.y : p.y) * scale;
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(p.car ? p.car.angle : p.angle);
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(8, 0);
  ctx.lineTo(-5, -5);
  ctx.lineTo(-5, 5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x0 + size / 2, y0 + size / 2, size / 2, 0, TAU);
  ctx.stroke();
  // North indicator.
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.fillText('N', x0 + size / 2 - 4, y0 - 4);
}

// --------------------------------------------------------------- screens

function drawTitle(ctx, state, w, h) {
  ctx.fillStyle = 'rgba(8,10,20,0.55)';
  ctx.fillRect(0, 0, w, h);
  const cx = w / 2;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd23d';
  ctx.font = 'bold 84px system-ui, sans-serif';
  ctx.fillText('VERANO HEAT', cx, h * 0.32);
  ctx.fillStyle = '#ff6a4a';
  ctx.font = 'bold 22px system-ui, sans-serif';
  ctx.fillText('P O R T   V E R A N O', cx, h * 0.32 + 38);
  ctx.fillStyle = '#fff';
  ctx.font = '16px system-ui, sans-serif';
  ctx.fillText('An open-world crime story — 12 missions, 9 districts, 7 rides, 5 stars of heat.', cx, h * 0.32 + 72);
  ctx.fillStyle = '#ffd23d';
  ctx.font = 'bold 20px system-ui, sans-serif';
  ctx.fillText('▶  PRESS ENTER TO START', cx, h * 0.52);
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = '15px system-ui, sans-serif';
  const lines = [
    'WASD — move / drive      E — steal car / interact      Mouse — aim, click — shoot',
    'Q (hold) — weapon wheel      R — radio      P — pause      F5 — save      F9 — load',
    'Steal cars, run missions for Mara Solis, outrun the VPD — and take back Port Verano.',
  ];
  lines.forEach((l, i) => ctx.fillText(l, cx, h * 0.62 + i * 26));
  if (state.hasSaveFlag) {
    ctx.fillStyle = '#7aff6a';
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.fillText('A saved game was found — press L to continue it.', cx, h * 0.62 + 3 * 26 + 10);
  }
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = '12px system-ui, sans-serif';
  ctx.fillText('An original game. No part of it comes from any commercial game.', cx, h - 24);
  ctx.textAlign = 'left';
}

function drawPause(ctx, state, w, h) {
  ctx.fillStyle = 'rgba(8,10,20,0.6)';
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 44px system-ui, sans-serif';
  ctx.fillText('PAUSED', w / 2, h * 0.36);
  ctx.font = '16px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  const rows = [
    `Cash ${money(state.cash)}  ·  Missions ${state.missionsDone}/12  ·  Kills ${state.kills || 0}  ·  Cars stolen ${state.carsStolen || 0}`,
    'P / Esc — resume      F5 — save      F9 — load      M — mute',
    'District standing:',
  ];
  rows.forEach((r, i) => ctx.fillText(r, w / 2, h * 0.44 + i * 26));
  let y = h * 0.44 + 3 * 26 + 8;
  for (const d of DISTRICTS) {
    const v = state.standing[d.name] || 0;
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.font = '13px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(d.name, w / 2 - 90, y);
    ctx.textAlign = 'left';
    drawBar(ctx, w / 2 - 80, y - 11, 160, 9, v / 100, '#ffd23d');
    ctx.fillStyle = '#fff';
    ctx.fillText(`${v}`, w / 2 + 90, y);
    y += 20;
  }
  ctx.textAlign = 'left';
}

function drawBriefing(ctx, state, w, h) {
  const def = state.briefing;
  if (!def) return;
  ctx.fillStyle = 'rgba(8,10,20,0.65)';
  ctx.fillRect(0, 0, w, h);
  panel(ctx, w / 2 - 320, h * 0.22, 640, 300);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd23d';
  ctx.font = 'bold 26px system-ui, sans-serif';
  ctx.fillText(`MISSION ${def.id}: ${def.title}`, w / 2, h * 0.22 + 44);
  ctx.fillStyle = '#ff9ad9';
  ctx.font = 'bold 14px system-ui, sans-serif';
  ctx.fillText(`${def.giver}  ·  ${def.district}  ·  Reward ${money(def.reward)}`, w / 2, h * 0.22 + 72);
  ctx.fillStyle = '#fff';
  ctx.font = '16px system-ui, sans-serif';
  wrapText(ctx, def.brief, w / 2, h * 0.22 + 108, 580, 24);
  ctx.fillStyle = '#7aff6a';
  ctx.font = 'bold 18px system-ui, sans-serif';
  ctx.fillText('ENTER — accept      ESC — later', w / 2, h * 0.22 + 250);
  ctx.textAlign = 'left';
}

function wrapText(ctx, text, cx, y, maxW, lh) {
  const words = text.split(' ');
  let line = '';
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, cx, y);
      line = word;
      y += lh;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, cx, y);
}

function drawShop(ctx, state, w, h) {
  const zone = state.shop;
  const lines = shopMenu(state, zone);
  ctx.fillStyle = 'rgba(8,10,20,0.6)';
  ctx.fillRect(0, 0, w, h);
  panel(ctx, w / 2 - 340, h * 0.2, 680, 70 + lines.length * 30);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd23d';
  ctx.font = 'bold 22px system-ui, sans-serif';
  ctx.fillText(zone.name.toUpperCase(), w / 2, h * 0.2 + 36);
  ctx.fillStyle = '#7aff6a';
  ctx.font = 'bold 16px system-ui, sans-serif';
  ctx.fillText(`Cash ${money(state.cash)}`, w / 2, h * 0.2 + 60);
  ctx.textAlign = 'left';
  ctx.font = '15px system-ui, sans-serif';
  lines.forEach((l, i) => {
    const y = h * 0.2 + 92 + i * 30;
    if (l.title) {
      ctx.fillStyle = '#cfe8ff';
      ctx.fillText(l.title, w / 2 - 310, y);
    } else {
      ctx.fillStyle = '#fff';
      ctx.fillText(`${l.key ? l.key + '. ' : ''}${l.text}`, w / 2 - 310, y);
    }
  });
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.font = '13px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('E — leave', w / 2, h * 0.2 + 70 + lines.length * 30 - 8);
  ctx.textAlign = 'left';
}

function drawWeaponWheel(ctx, state, w, h) {
  const cx = w / 2;
  const cy = h / 2;
  ctx.fillStyle = 'rgba(8,10,20,0.55)';
  ctx.beginPath();
  ctx.arc(cx, cy, 150, 0, TAU);
  ctx.fill();
  const owned = state.player.loadout.owned;
  owned.forEach((id, i) => {
    const a = -Math.PI / 2 + (i / owned.length) * TAU;
    const x = cx + Math.cos(a) * 95;
    const y = cy + Math.sin(a) * 95;
    const sel = state.player.loadout.selected === i;
    ctx.fillStyle = sel ? '#ffd23d' : 'rgba(255,255,255,0.15)';
    ctx.beginPath();
    ctx.arc(x, y, sel ? 42 : 34, 0, TAU);
    ctx.fill();
    ctx.fillStyle = sel ? '#111' : '#fff';
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    const nm = id === 'fists' ? 'FISTS' : id.toUpperCase();
    ctx.fillText(nm, x, y - 2);
    ctx.font = '11px system-ui, sans-serif';
    const ammo = state.player.loadout.ammo[id];
    ctx.fillText(ammo === Infinity ? '∞' : String(ammo), x, y + 14);
  });
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('WEAPON WHEEL — press 1-4 or click a slot', cx, cy + 185);
  ctx.textAlign = 'left';
}

function drawBusted(ctx, w, h, title, sub) {
  ctx.fillStyle = 'rgba(10,10,16,0.72)';
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.fillStyle = title === 'WASTED' ? '#ff4a3d' : '#4aa8d9';
  ctx.font = 'bold 64px system-ui, sans-serif';
  ctx.fillText(title, w / 2, h * 0.4);
  ctx.fillStyle = '#fff';
  ctx.font = '17px system-ui, sans-serif';
  ctx.fillText(sub, w / 2, h * 0.4 + 36);
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.font = '15px system-ui, sans-serif';
  ctx.fillText('Respawning…', w / 2, h * 0.4 + 70);
  ctx.textAlign = 'left';
}
