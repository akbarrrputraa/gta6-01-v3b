// Story missions: 12 chapters for Dario Cruz, from his first shift for
// fixer Mara Solis to the finale against El Toro. Each mission is data:
// steps of goto / kill / collect / race / chase / escape, driven by the
// small state machine below.

import { dist } from './util.js';
import { LANDMARKS, nearestRoadLine } from './city.js';
import { makeCar } from './vehicles.js';

export const MISSIONS = [
  {
    id: 1, title: 'First Shift', giver: 'Mara Solis', district: 'Calle Sol', reward: 400,
    brief: 'Mara needs a driver she can trust. Meet her at the office, then run a delivery to Taco Sol.',
    steps: [
      { kind: 'goto', x: LANDMARKS.marasOffice.x, y: LANDMARKS.marasOffice.y, label: 'Meet Mara at her office' },
      { kind: 'goto', x: LANDMARKS.foodStand.x, y: LANDMARKS.foodStand.y, label: 'Deliver the package to Taco Sol' },
    ],
  },
  {
    id: 2, title: 'Hot Wheels', giver: 'Mara Solis', district: 'Downtown', reward: 800,
    brief: 'A Viento GT is parked outside the bank, keys in it. Take it — quietly — and bring it to Turbo Works.',
    steps: [
      { kind: 'goto', x: LANDMARKS.bank.x, y: LANDMARKS.bank.y, label: 'Find the Viento GT by the bank' },
      { kind: 'deliverCar', x: LANDMARKS.garage.x, y: LANDMARKS.garage.y, label: 'Deliver the Viento GT to Turbo Works' },
    ],
  },
  {
    id: 3, title: 'Loud Neighbor', giver: 'Mara Solis', district: 'Calle Sol', reward: 900,
    brief: 'The Rojos are leaning on the market stalls. Clear three of them out of Calle Sol.',
    steps: [
      { kind: 'kill', count: 3, x: 2100, y: 2100, label: 'Deal with the Rojos (0/3)' },
    ],
  },
  {
    id: 4, title: 'Pizza Run', giver: 'Taco Sol', district: 'Old Town', reward: 700,
    brief: 'Three orders, one scooter of a deadline. Deliver to all three houses before the food goes cold.',
    timer: 100,
    steps: [
      { kind: 'collect', points: [{ x: 1800, y: 600 }, { x: 2600, y: 600 }, { x: 2200, y: 1000 }], label: 'Deliver the orders' },
    ],
  },
  {
    id: 5, title: 'Beach Party', giver: 'DJ Palma', district: 'Beachfront', reward: 1000,
    brief: 'DJ Palma bets no one can run the boardwalk in under a minute. Prove him wrong.',
    timer: 70,
    steps: [
      { kind: 'race', points: [{ x: 3400, y: 4200 }, { x: 3800, y: 4400 }, { x: 4400, y: 4200 }, { x: 4400, y: 3600 }, { x: 3800, y: 3400 }], label: 'Race the boardwalk checkpoints' },
    ],
  },
  {
    id: 6, title: 'Harbor Heist', giver: 'Mara Solis', district: 'Harbor', reward: 1200,
    brief: 'Four crates of "imported goods" sit on the docks. Grab them all and stay off the VPD radar.',
    steps: [
      { kind: 'collect', points: [{ x: 400, y: 4200 }, { x: 600, y: 4400 }, { x: 400, y: 3800 }, { x: 800, y: 4200 }], label: 'Collect the harbor crates' },
    ],
  },
  {
    id: 7, title: 'Payback', giver: 'Mara Solis', district: 'Industrial', reward: 1400,
    brief: 'Rico Vega torched one of our cars. His Bison is running the Industrial loop — wreck it.',
    steps: [
      { kind: 'chase', x: 2200, y: 3800, label: 'Wreck Rico Vega\'s Bison' },
    ],
  },
  {
    id: 8, title: 'Silent Streets', giver: 'Mara Solis', district: 'Old Town', reward: 1500,
    brief: 'Five Rojos hold the Old Town plaza. Take the plaza back, street by street.',
    steps: [
      { kind: 'kill', count: 5, x: 2000, y: 800, label: 'Clear the Old Town plaza (0/5)' },
    ],
  },
  {
    id: 9, title: 'Getaway Driver', giver: 'Mara Solis', district: 'Downtown', reward: 1800,
    brief: 'Pick up the crew at the bank, then lose a 3-star tail and get them to the Old Town safehouse.',
    steps: [
      { kind: 'goto', x: LANDMARKS.bank.x, y: LANDMARKS.bank.y, label: 'Pick up the crew at the bank' },
      { kind: 'escape', x: LANDMARKS.safehouse1.x, y: LANDMARKS.safehouse1.y, wanted: 3, label: 'Lose the cops, reach the safehouse' },
    ],
  },
  {
    id: 10, title: 'The Big Score', giver: 'Mara Solis', district: 'Downtown', reward: 3000,
    brief: 'Banco Verano, noon, one duffel bag. Grab the cash, then shake a 4-star response to the Beachfront safehouse.',
    steps: [
      { kind: 'goto', x: LANDMARKS.bank.x, y: LANDMARKS.bank.y, label: 'Enter Banco Verano' },
      { kind: 'escape', x: LANDMARKS.safehouse2.x, y: LANDMARKS.safehouse2.y, wanted: 4, label: 'Escape to the Beachfront safehouse' },
    ],
  },
  {
    id: 11, title: 'King of the Hill', giver: 'DJ Palma', district: 'Beachfront', reward: 2500,
    brief: 'The Verano Grand Prix: five checkpoints, one champion. Win it and the streets are yours.',
    timer: 110,
    steps: [
      { kind: 'race', points: [{ x: 3400, y: 4200 }, { x: 4200, y: 4400 }, { x: 4400, y: 3400 }, { x: 3400, y: 3400 }, { x: 3400, y: 4200 }], label: 'Win the Verano Grand Prix' },
    ],
  },
  {
    id: 12, title: 'Verano Nights', giver: 'Mara Solis', district: 'North Hills', reward: 5000,
    brief: 'El Toro runs this city from his compound. End it tonight: his guards, then him.',
    steps: [
      { kind: 'kill', count: 5, x: LANDMARKS.compound.x, y: LANDMARKS.compound.y, label: 'Storm the compound (0/5)', boss: true },
    ],
  },
];

/** Start mission `index` (0-based) on the game state. */
export function startMission(state, index) {
  const def = MISSIONS[index];
  if (!def) return false;
  state.mission = {
    def, index, step: 0, timer: def.timer || 0,
    targets: [], collected: 0, killed: 0, checkpoint: 0,
    startedAt: state.time, active: true, failed: false,
  };
  spawnStepTargets(state);
  state.toast = `MISSION ${def.id}: ${def.title} — ${def.brief}`;
  state.toastTimer = 6;
  return true;
}

/** Spawn the targets for the mission's current step. */
export function spawnStepTargets(state) {
  const m = state.mission;
  if (!m) return;
  const step = m.def.steps[m.step];
  if (!step) return;
  m.targets = [];
  if (step.kind === 'kill') {
    const n = step.count;
    // Targets stand on the roads crossing near the step point, never inside a block.
    const lx = nearestRoadLine(step.x);
    const ly = nearestRoadLine(step.y);
    for (let i = 0; i < n; i++) {
      const along = (i - (n - 1) / 2) * 90;
      const onVertical = i % 2 === 0;
      m.targets.push({
        kind: step.boss && i === n - 1 ? 'boss' : 'gang',
        name: step.boss && i === n - 1 ? 'El Toro' : 'Rojo',
        x: onVertical ? lx : lx + along,
        y: onVertical ? ly + along : ly,
        health: step.boss && i === n - 1 ? 220 : 55, radius: step.boss && i === n - 1 ? 18 : 15,
        dead: false, hostile: true, shootCd: 1 + i * 0.4, speed: 95,
      });
    }
  } else if (step.kind === 'chase') {
    m.targets.push({
      kind: 'car', name: "Rico Vega's Bison",
      x: step.x, y: step.y, angle: 0, speed: 0,
      health: 160, radius: 26, dead: false, hostile: true,
    });
  } else if (step.kind === 'deliverCar') {
    // The Viento GT is a real, enterable car parked by the bank.
    if (!m.vientoSpawned) {
      m.vientoSpawned = true;
      state.parkedCars.push(makeCar('viento', LANDMARKS.bank.x + 60, LANDMARKS.bank.y + 40, 0.4, false));
    }
  }
}

/** Current objective text for the HUD. */
export function missionObjective(state) {
  const m = state.mission;
  if (!m || !m.active) return null;
  const step = m.def.steps[m.step];
  if (!step) return null;
  let label = step.label || '';
  if (step.kind === 'kill') label = label.replace(/\(\d+\/\d+\)/, `(${m.killed}/${step.count})`);
  if (step.kind === 'collect' || step.kind === 'race') {
    const total = step.points.length;
    const done = step.kind === 'collect' ? m.collected : m.checkpoint;
    label = `${label} (${done}/${total})`;
  }
  return { title: `MISSION ${m.def.id}: ${m.def.title}`, label, timer: m.timer > 0 ? m.timer : 0 };
}

/** Current waypoint for the HUD arrow / minimap, or null. */
export function missionWaypoint(state) {
  const m = state.mission;
  if (!m || !m.active) return null;
  const step = m.def.steps[m.step];
  if (!step) return null;
  if (step.kind === 'goto' || step.kind === 'escape' || step.kind === 'deliverCar') return { x: step.x, y: step.y };
  if (step.kind === 'kill') return { x: nearestRoadLine(step.x), y: nearestRoadLine(step.y) };
  if (step.kind === 'chase') {
    const t = m.targets[0];
    return t && !t.dead ? { x: t.x, y: t.y } : { x: step.x, y: step.y };
  }
  if (step.kind === 'collect' || step.kind === 'race') {
    const idx = step.kind === 'collect' ? m.collected : m.checkpoint;
    const pt = step.points[Math.min(idx, step.points.length - 1)];
    return pt ? { x: pt.x, y: pt.y } : null;
  }
  return null;
}

/** Advance the mission state; returns 'complete' | 'failed' | null. */
export function updateMission(state, dt) {
  const m = state.mission;
  if (!m || !m.active) return null;
  const p = state.player;
  const px = p.car ? p.car.x : p.x;
  const py = p.car ? p.car.y : p.y;
  if (m.timer > 0) {
    m.timer -= dt;
    if (m.timer <= 0) {
      failMission(state, 'out of time');
      return 'failed';
    }
  }
  const step = m.def.steps[m.step];
  if (!step) return null;
  const reach = (x, y, r) => dist(px, py, x, y) < r;
  if (step.kind === 'goto') {
    if (reach(step.x, step.y, 70)) return advanceStep(state);
  } else if (step.kind === 'deliverCar') {
    if (p.car && p.car.type === 'viento' && reach(step.x, step.y, 90)) return advanceStep(state);
  } else if (step.kind === 'escape') {
    if (reach(step.x, step.y, 80) && state.wanted === 0) return advanceStep(state);
  } else if (step.kind === 'kill') {
    const alive = m.targets.filter((t) => !t.dead).length;
    if (m.targets.length > 0 && alive === 0) return advanceStep(state);
  } else if (step.kind === 'chase') {
    const t = m.targets[0];
    if (t && t.dead) return advanceStep(state);
  } else if (step.kind === 'collect') {
    const pt = step.points[m.collected];
    if (pt && reach(pt.x, pt.y, 60)) {
      m.collected++;
      state.sfx.pickup();
      if (m.collected >= step.points.length) return advanceStep(state);
    }
  } else if (step.kind === 'race') {
    const pt = step.points[m.checkpoint];
    if (pt && reach(pt.x, pt.y, 70)) {
      m.checkpoint++;
      state.sfx.pickup();
      if (m.checkpoint >= step.points.length) return advanceStep(state);
    }
  }
  return null;
}

function advanceStep(state) {
  const m = state.mission;
  m.step++;
  if (m.step >= m.def.steps.length) {
    completeMission(state);
    return 'complete';
  }
  // Entering an escape step raises the heat.
  const step = m.def.steps[m.step];
  if (step && step.kind === 'escape') {
    state.wanted = Math.max(state.wanted, step.wanted || 3);
  }
  spawnStepTargets(state);
  state.sfx.mission();
  return null;
}

/** Pay out the mission, unlock the next one, raise district standing. */
export function completeMission(state) {
  const m = state.mission;
  const def = m.def;
  state.cash += def.reward;
  state.missionsDone++;
  const d = state.standing[def.district] || 0;
  state.standing[def.district] = Math.min(100, d + 15);
  state.toast = `MISSION COMPLETE: ${def.title} — +$${def.reward.toLocaleString('en-US')}`;
  state.toastTimer = 5;
  state.sfx.cash();
  state.mission = null;
  state.nextMission = Math.min(state.nextMission + 1, MISSIONS.length);
  state.saveRequested = true;
}

/** Fail the active mission (timer out, or player wasted mid-mission). */
export function failMission(state, reason) {
  const m = state.mission;
  if (!m) return;
  state.toast = `MISSION FAILED: ${m.def.title} — ${reason}`;
  state.toastTimer = 5;
  state.sfx.fail();
  state.mission = null;
}
