'use strict';

// Exercise the actual SoftBody/Skin classes embedded in index.html. No browser,
// graphics adapter, npm package, copied solver, or external resource is used.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { performance } = require('node:perf_hooks');

const htmlPath = path.resolve(__dirname, '..', 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)];
assert.equal(scripts.length, 1, 'Test expects one classic inline application script.');
const script = scripts[0][1];
new vm.Script(script, { filename: 'index.html:inline-script' });
const appBoundary = script.indexOf('let sim,skin,renderer,camera');
assert.ok(appBoundary > 0, 'Cannot locate application bootstrap; update the test extraction after refactoring.');
const { SoftBody, Skin } = new Function(
  script.slice(0, appBoundary) + ';return {SoftBody,Skin};'
)();

const sim = new SoftBody();
const skin = new Skin(sim);
const geometry = {
  nodes: sim.count,
  tetrahedra: sim.rv.length,
  triangles: skin.indices.length / 3,
  bodyTriangles: skin.bodyCount / 3,
  vertices: skin.kind.length,
  fallbackBindings: skin.bind.filter(binding => binding.ids.length === 1).length,
};
assert.equal(geometry.fallbackBindings, 0, 'All skin details should use volumetric bindings.');
console.log('Geometry:', JSON.stringify(geometry));

// Engineering regression bounds for this specimen, not universal physical
// guarantees. Check sampled states every 15 fixed steps, including release.
const limits = { maxStrain: 2.5, minVolumeRatio: 0.9, maxVolumeRatio: 1.1, minSurfaceY: 0.0119 };
const samples = [];
const checkpoints = [];
let fixedSteps = 0;
let simulationMs = 0;

function checkState(name, checkpoint = false) {
  skin.update();
  const metrics = sim.metrics();
  let minSurfaceY = Infinity;
  for (let i = 1; i < skin.positions.length; i += 3) minSurfaceY = Math.min(minSurfaceY, skin.positions[i]);
  assert.ok(metrics.finite && sim.v.every(Number.isFinite), `${name}: non-finite simulation value`);
  assert.ok(skin.data.every(Number.isFinite), `${name}: non-finite rendered skin attribute`);
  assert.ok(metrics.minFloorClearance >= -0.0001, `${name}: lattice floor penetration`);
  assert.ok(minSurfaceY >= limits.minSurfaceY, `${name}: rendered surface floor penetration (${minSurfaceY})`);
  assert.ok(metrics.maxStrain <= limits.maxStrain, `${name}: excessive sampled edge strain (${metrics.maxStrain})`);
  assert.ok(metrics.volumeRatio >= limits.minVolumeRatio && metrics.volumeRatio <= limits.maxVolumeRatio,
    `${name}: sampled signed volume ratio outside regression range (${metrics.volumeRatio})`);
  const sample = { name, ...metrics, minSurfaceY };
  samples.push(sample);
  if (checkpoint) checkpoints.push(sample);
  return sample;
}

function advance(steps, phase) {
  for (let i = 0; i < steps; i++) {
    const start = performance.now();
    sim.step(1 / 90);
    simulationMs += performance.now() - start;
    fixedSteps++;
    if ((i + 1) % 15 === 0) checkState(`${phase}:${i + 1}`);
  }
}

advance(270, 'initial-settle');
checkState('settle-3s', true);
const pullSites = [
  ['tail', [-2.7, 1.8, 0.04]],
  ['head', [1.65, 3.05, 0.3]],
  ['arm', [1.05, 1.92, 0.7]],
  ['foot', [0.9, 0.2, 0.7]],
  ['body', [-0.25, 1.8, 0.5]],
];
for (const [name, restPoint] of pullSites) {
  for (let repeat = 0; repeat < 3; repeat++) {
    const bind = sim.binding(restPoint);
    const currentPoint = sim.map(bind);
    // Direct solver stress intentionally exceeds the UI's total pull-distance
    // clamp. Alternate strong pulls without resetting the preceding state.
    sim.grab = { bind, target: [currentPoint[0] + (repeat % 2 ? 2.6 : -2.6), currentPoint[1] + 2, currentPoint[2] + 1.5] };
    advance(90, `${name}-pull-${repeat}`);
    checkState(`${name}-pull-${repeat}`, true);
    sim.grab = null;
    advance(90, `${name}-release-${repeat}`);
  }
}
const released = checkState('released', true);
advance(540, 'final-settle');
const settled = checkState('settled-after-stress', true);
assert.ok(settled.energy < 0.1 && settled.energy < released.energy * 0.1,
  'Released specimen should lose most motion and settle during the following six simulated seconds.');

for (const firmness of [0, 1]) {
  sim.reset();
  sim.firm = firmness;
  sim.nudge();
  assert.ok(sim.v.some(value => value !== 0), 'Nudge must impart motion.');
  advance(180, `firmness-${firmness}`);
  checkState(`firmness-${firmness}`, true);
}

sim.paused = true;
const pausedPositions = sim.p.slice();
const pausedVelocities = sim.v.slice();
sim.step(1 / 90);
sim.nudge();
assert.deepEqual(sim.p, pausedPositions, 'Pause must preserve positions exactly.');
assert.deepEqual(sim.v, pausedVelocities, 'Pause must preserve velocities; paused nudge must do nothing.');
sim.reset();
assert.deepEqual(sim.p, sim.rest, 'Reset must restore every lattice position exactly.');
assert.ok(sim.v.every(value => value === 0), 'Reset must clear every velocity.');
assert.equal(sim.grab, null, 'Reset must clear the active grab.');

console.log('Checkpoints:', JSON.stringify(checkpoints.map(({ name, maxStrain, volumeRatio, minSurfaceY, energy }) =>
  ({ name, maxStrain, volumeRatio, minSurfaceY, energy })), null, 2));
console.log('Summary:', JSON.stringify({
  strongPulls: 15,
  fixedSteps,
  sampledStates: samples.length,
  maxSampledStrain: Math.max(...samples.map(sample => sample.maxStrain)),
  volumeRatioRange: [Math.min(...samples.map(sample => sample.volumeRatio)), Math.max(...samples.map(sample => sample.volumeRatio))],
  minSampledSurfaceY: Math.min(...samples.map(sample => sample.minSurfaceY)),
  releasedEnergy: released.energy,
  settledEnergy: settled.energy,
  measuredMsPerStep: simulationMs / fixedSteps,
  regressionLimits: limits,
}));
console.log('PASS: repeated strong pulls/releases, sampled floor contacts, finite skinning, approximate volume preservation, recovery, nudge, firmness endpoints, exact pause/reset.');

