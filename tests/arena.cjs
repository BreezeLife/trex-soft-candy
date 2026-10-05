'use strict';

// Numeric tests of the actual embedded solver and camera. No browser or GPU.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const script = html.match(/<script\b[^>]*>([\s\S]*?)<\/script>/i)[1];
const { SoftBody, Skin, Camera } = new Function(script.slice(0, script.indexOf('let sim,skin,renderer,camera')) + ';return {SoftBody,Skin,Camera}')();
const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);
const sim = new SoftBody(), skin = new Skin(sim), camera = new Camera();
const meanVelocity = () => [0, 1, 2].map(axis => sim.v.reduce((sum, value, i) => sum + (i % 3 === axis ? value : 0), 0) / sim.count);
camera.update(1.6);
if (camera.arena && sim.setArena) sim.setArena(camera.arena());
const pushes = [];
for (let i = 0; i < 6; i++) { sim.v.fill(0); sim.nudge(); pushes.push(meanVelocity()); }
assert.ok(pushes.some(v => dot(v, camera.right) > 2) && pushes.some(v => dot(v, camera.right) < -2), 'Repeated nudges must alternate appreciable left and right motion.');
assert.ok(pushes.some(v => dot(v, camera.forward) > 2) && pushes.some(v => dot(v, camera.forward) < -2), 'Repeated nudges must include appreciable toward and away motion.');
assert.equal(typeof camera.arena, 'function', 'Camera must define a finite arena from its actual stage aspect.');
assert.equal(typeof sim.setArena, 'function', 'SoftBody must accept the camera-space collision planes.');

const rebounds = [];
for (const wall of [0, 1, 4, 5]) {
  sim.reset(); camera.reset(); camera.distance = 10; camera.update(1.6); sim.setArena(camera.arena());
  const plane = sim.arena.planes[wall], n = plane.normal;
  const horizontal = Math.hypot(n[0], n[2]), inward = [n[0] / horizontal, 0, n[2] / horizontal];
  let clearance = Infinity;
  for (let i = 0; i < sim.p.length; i += 3) clearance = Math.min(clearance, dot(n, sim.p.slice(i, i + 3)) - plane.offset);
  const shift = (clearance - .025) / dot(n, inward);
  for (let i = 0; i < sim.p.length; i += 3) for (let axis = 0; axis < 3; axis++) { sim.p[i + axis] -= inward[axis] * shift; sim.v[i + axis] = -inward[axis] * 6; }
  let peakOutgoing = 0, contacts = 0;
  for (let step = 0; step < 18; step++) {
    sim.step(1 / 90);
    for (let i = 0; i < sim.count; i++) if (sim.arenaContact[i] & (1 << wall)) { contacts++; peakOutgoing = Math.max(peakOutgoing, dot(n, sim.v.slice(i * 3, i * 3 + 3))); }
  }
  assert.ok(contacts > 0, `Wall ${wall} must produce local contacts.`);
  assert.ok(peakOutgoing > .3 && peakOutgoing < 15, `Wall ${wall} must rebound inward with bounded speed (${peakOutgoing}).`);
  rebounds.push({ wall, contacts, peakOutgoing });
}

const singlePushes = [];
for (const [name, aspect] of [['desktop', 1.6], ['phone', .78]]) {
  sim.reset(); camera.reset(); camera.update(aspect); camera.distance = Math.max(8.5, camera.framingDistance()); camera.update(aspect); sim.setArena(camera.arena());
  for (let i = 0; i < 180; i++) sim.step(1 / 90);
  sim.nudge(); let previousSign = 1, reversals = 0, positive = 0, negative = 0, minX = Infinity, maxX = -Infinity;
  let depthSign = 1, depthReversals = 0, toward = 0, away = 0, minDepth = Infinity, maxDepth = -Infinity;
  for (let i = 0; i < 540; i++) {
    sim.step(1 / 90);
    const speed = dot(meanVelocity(), camera.right);
    const center = [0, 1, 2].map(axis => sim.p.reduce((sum, value, k) => sum + (k % 3 === axis ? value : 0), 0) / sim.count);
    const x = dot(center, camera.right); minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    const depthSpeed = dot(meanVelocity(), camera.forward), depth = dot(center, camera.forward);
    toward = Math.min(toward, depthSpeed); away = Math.max(away, depthSpeed); minDepth = Math.min(minDepth, depth); maxDepth = Math.max(maxDepth, depth);
    if (Math.abs(depthSpeed) > .7 && Math.sign(depthSpeed) !== depthSign) { depthReversals++; depthSign = Math.sign(depthSpeed); }
    positive = Math.max(positive, speed); negative = Math.min(negative, speed);
    if (Math.abs(speed) > .7 && Math.sign(speed) !== previousSign) { reversals++; previousSign = Math.sign(speed); }
  }
  assert.ok(reversals >= 2 && negative < -1.2 && maxX - minX > 1.5, name + ': one push must visibly rebound both ways, ' + JSON.stringify({ reversals, positive, negative, travel: maxX - minX }));
  assert.ok(depthReversals >= 1 && toward < -.7 && away > .7 && maxDepth - minDepth > 1.25, name + ': one push must also reverse appreciably in depth, ' + JSON.stringify({ depthReversals, toward, away, travel: maxDepth - minDepth }));
  singlePushes.push({ name, reversals, positive, negative, lateralRange: [minX, maxX], depthReversals, toward, away, depthRange: [minDepth, maxDepth] });
}

const transitions = [];
for (const change of ['resize', 'turn-and-resize']) {
  sim.reset(); camera.reset(); camera.update(1.6); sim.setArena(camera.arena());
  for (let i = 0; i < 180; i++) sim.step(1 / 90);
  sim.nudge(); for (let i = 0; i < 70; i++) sim.step(1 / 90);
  const incomingEnergy = sim.metrics().energy;
  if (change === 'turn-and-resize') { camera.yaw += Math.PI; camera.pitch = .72; }
  camera.target = [-.35, 1.87, 0]; camera.update(.43);
  camera.distance = Math.max(8.7, 5.3 / (2 * Math.tan(.3) * .43), camera.framingDistance()); camera.update(.43); sim.setArena(camera.arena());
  let peakEnergy = 0, minVolume = 1, maxStepMotion = 0;
  for (let i = 0; i < 720; i++) {
    const before = sim.p.slice(); sim.step(1 / 90); const state = sim.metrics();
    peakEnergy = Math.max(peakEnergy, state.energy); minVolume = Math.min(minVolume, state.volumeRatio);
    for (let j = 0; j < sim.p.length; j += 3) maxStepMotion = Math.max(maxStepMotion, Math.hypot(sim.p[j] - before[j], sim.p[j + 1] - before[j + 1], sim.p[j + 2] - before[j + 2]));
    assert.ok(state.finite && sim.v.every(Number.isFinite) && state.volumeRatio > .9 && state.volumeRatio < 1.1, change + ': moving walls must preserve volume, ' + JSON.stringify(state));
    assert.ok(state.energy < Math.max(160, incomingEnergy * 1.8), change + ': moving walls must not inject a large kinetic spike');
  }
  assert.ok(maxStepMotion < .4, change + ': walls must move the nodes incrementally, not teleport them (' + maxStepMotion + ')');
  assert.ok(sim.arena.planes.every(plane => Math.abs(plane.offset - plane.targetOffset) < .0001), change + ': arena must finish tightening');
  transitions.push({ change, incomingEnergy, peakEnergy, minVolume, maxStepMotion, finalEnergy: sim.metrics().energy });
}

const scenarios = [
  { name: 'desktop', aspect: 1.6, yaw: .38, pitch: .14 },
  { name: 'narrow-phone', aspect: .43, yaw: .38, pitch: .14 },
  { name: 'wide-landscape', aspect: 2.8, yaw: 1.3, pitch: .55 },
  { name: 'rear-tablet', aspect: .75, yaw: 3.2, pitch: -.04 },
  { name: 'high-angle', aspect: 1, yaw: 4.6, pitch: .72 },
];
const summary = [];
for (const scene of scenarios) {
  sim.reset(); sim.firm = scene.name === 'wide-landscape' ? 0 : .55; sim.damping = .35;
  camera.reset(); camera.yaw = scene.yaw; camera.pitch = scene.pitch; camera.update(scene.aspect);
  camera.distance = Math.max(8.5, camera.framingDistance()); camera.update(scene.aspect); sim.setArena(camera.arena());
  let maxProjection = 0, maxStrain = 0, minVolume = Infinity, maxVolume = -Infinity, maxEnergy = 0, contactSteps = 0, depthMin = Infinity, depthMax = -Infinity;
  for (let step = 0; step < 990; step++) {
    if (step < 540 && step % 60 === 0) sim.nudge();
    sim.step(1 / 90);
    if (sim.arenaContact.some(Boolean)) contactSteps++;
    if (step % 15) continue;
    skin.update(); const metrics = sim.metrics();
    assert.ok(metrics.finite && sim.v.every(Number.isFinite) && skin.data.every(Number.isFinite), scene.name + ': finite solver and skin');
    assert.ok(metrics.volumeRatio > .9 && metrics.volumeRatio < 1.1, scene.name + ': volume ratio ' + metrics.volumeRatio);
    assert.ok(metrics.maxStrain < 2.5, scene.name + ': edge strain ' + metrics.maxStrain);
    const projections = [];
    for (let i = 0; i < skin.bodyCount; i++) {
      const index = skin.indices[i] * 3, p = skin.positions.slice(index, index + 3), q = p.map((v, a) => v - camera.eye[a]);
      const depth = dot(q, camera.forward);
      assert.ok(depth > 1 && p[1] >= .0118, scene.name + ': positive depth and fixed floor');
      projections.push(Math.max(Math.abs(dot(q, camera.right) / (depth * camera.tan * scene.aspect)), Math.abs(dot(q, camera.up) / (depth * camera.tan))));
      depthMin = Math.min(depthMin, depth); depthMax = Math.max(depthMax, depth);
    }
    projections.sort((a, b) => a - b);
    const almostAll = projections[Math.floor(projections.length * .98)];
    assert.ok(almostAll < 1.12 && projections.at(-1) < 1.23, scene.name + ': projected specimen escapes arena ' + almostAll);
    maxProjection = Math.max(maxProjection, almostAll); maxStrain = Math.max(maxStrain, metrics.maxStrain);
    minVolume = Math.min(minVolume, metrics.volumeRatio); maxVolume = Math.max(maxVolume, metrics.volumeRatio); maxEnergy = Math.max(maxEnergy, metrics.energy);
  }
  assert.ok(contactSteps > 2, scene.name + ': repeated nudges must reach the fence');
  assert.ok(sim.metrics().energy < .15, scene.name + ': release must dissipate instead of gaining energy forever (' + sim.metrics().energy + ')');
  summary.push({ ...scene, distance: camera.distance, maxProjection, maxStrain, volumeRange: [minVolume, maxVolume], maxEnergy, finalEnergy: sim.metrics().energy, contactSteps, depthRange: [depthMin, depthMax] });
}

// A held part may reach the fence, but release must leave a finite, connected skin.
sim.reset(); camera.reset(); camera.update(.7); camera.distance = Math.max(9, camera.framingDistance()); camera.update(.7); sim.setArena(camera.arena());
const bind = sim.binding([1.65, 3.05, .3]), start = sim.map(bind);
sim.grab = { bind, target: start.map((value, axis) => value + camera.right[axis] * 3.8) };
for (let i = 0; i < 90; i++) sim.step(1 / 90);
sim.grab = null;
for (let i = 0; i < 450; i++) sim.step(1 / 90);
skin.update();
assert.ok(sim.metrics().finite && skin.data.every(Number.isFinite));
assert.ok(sim.metrics().volumeRatio > .9 && sim.metrics().volumeRatio < 1.1);
assert.ok(sim.metrics().energy < .15, 'Released fence pull must settle.');
console.log('Arena rebounds:', JSON.stringify(rebounds));
console.log('Single-push trajectories:', JSON.stringify(singlePushes));
console.log('Camera transitions:', JSON.stringify(transitions));
console.log('Arena scenarios:', JSON.stringify(summary));
console.log('PASS: view-relative nudges, local elastic contacts, stage projection bounds, finite volume, fixed floor and release recovery. Numeric evidence only.');
