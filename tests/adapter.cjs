'use strict';

// Exercise the actual adapter-selection helper with GPU API stand-ins only.
// No browser, Android device, driver, WGSL compilation, or rendering is tested.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');
const script = html.match(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/i)[1];
const start = script.indexOf('async function requestJellyAdapter(');
assert.ok(start >= 0, 'Adapter selection must be an independently testable application helper.');
const end = script.indexOf('class Renderer{', start);
assert.ok(end > start);
const requestJellyAdapter = new Function(script.slice(start, end) + ';return requestJellyAdapter;')();
assert.match(script.slice(end), /await requestJellyAdapter\(navigator\.gpu\)/, 'Renderer initialization must use the tested selection helper.');

const coreOptions = { powerPreference: 'high-performance' };
const compatibilityOptions = { powerPreference: 'high-performance', featureLevel: 'compatibility' };
function gpuWith(...results) {
  const calls = [];
  const gpu = { calls, requestAdapter(options) {
    assert.equal(this, gpu, 'Preserve the native GPU receiver.');
    assert.ok(calls.length < results.length, 'Do not retry or probe beyond the two authorized modes.');
    calls.push({ ...options });
    const result = results[calls.length - 1];
    if (typeof result === 'function') return result();
    return Promise.resolve(result);
  } };
  return gpu;
}
let passed = 0;
function pass(name) { passed++; console.log('PASS ' + name); }
async function main() {
  const coreAdapter = {}, core = gpuWith(coreAdapter);
  assert.equal(await requestJellyAdapter(core), coreAdapter);
  assert.deepEqual(core.calls, [coreOptions]);
  pass('a core adapter succeeds without compatibility probing');

  const compatibilityAdapter = {}, coreNull = gpuWith(null, compatibilityAdapter);
  assert.equal(await requestJellyAdapter(coreNull), compatibilityAdapter);
  assert.deepEqual(coreNull.calls, [coreOptions, compatibilityOptions]);
  pass('a null core adapter opts in to compatibility with the same power preference');

  const coreThrow = gpuWith(() => { throw Error('Expected core API rejection'); }, compatibilityAdapter);
  assert.equal(await requestJellyAdapter(coreThrow), compatibilityAdapter);
  assert.deepEqual(coreThrow.calls, [coreOptions, compatibilityOptions]);
  pass('a thrown core request can recover through compatibility');

  for (const [name, outcomes] of [
    ['both adapter modes return null', [null, null]],
    ['compatibility rejects after a null core adapter', [null, () => Promise.reject(Error('Expected compatibility rejection'))]],
    ['both adapter requests reject', [() => Promise.reject(Error('Expected core rejection')), () => { throw Error('Expected compatibility exception'); }]],
  ]) {
    const gpu = gpuWith(...outcomes);
    await assert.rejects(requestJellyAdapter(gpu), /Native WebGPU graphics adapter is unavailable.*core.*compatibility/i);
    assert.deepEqual(gpu.calls, [coreOptions, compatibilityOptions]);
    pass(name + ' reports native GPU unavailability without further probes');
  }
  console.log(`PASS: ${passed} Node adapter-handler checks. No browser, Android hardware, or GPU rendering was exercised.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
