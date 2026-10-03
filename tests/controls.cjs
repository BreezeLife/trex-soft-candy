'use strict';

// Run the actual application handlers against a minimal DOM/event harness.
// This is deliberately not a browser, GPU, CSS layout, or real touch test.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const htmlPath = path.resolve(__dirname, '..', 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)];
assert.equal(scripts.length, 1, 'Test expects one classic inline application script.');
const script = scripts[0][1];
new vm.Script(script, { filename: 'index.html:inline-script' });

const elements = new Map();
function element(id) {
  if (!elements.has(id)) {
    elements.set(id, {
      id, value: '55', checked: false, disabled: false, hidden: false, dataset: {}, tagName: 'CANVAS',
      style: {}, events: {}, attrs: {}, width: 1400, height: 900,
      classList: { values: new Set(), add(value) { this.values.add(value); }, remove(value) { this.values.delete(value); }, contains(value) { return this.values.has(value); } },
      addEventListener(type, callback) { this.events[type] = callback; },
      setAttribute(key, value) { this.attrs[key] = value; },
      getBoundingClientRect() { return { left: 0, top: 0, width: 1400, height: 900 }; },
      capturedPointers: new Set(), releasedPointers: [],
      focus() {},
      setPointerCapture(pointerId) { this.capturedPointers.add(pointerId); },
      hasPointerCapture(pointerId) { return this.capturedPointers.has(pointerId); },
      releasePointerCapture(pointerId) {
        assert.ok(this.hasPointerCapture(pointerId), 'Only release a capture still held by the canvas.');
        this.capturedPointers.delete(pointerId);
        this.releasedPointers.push(pointerId);
        // Exercise cleanup reentrancy without waiting for a browser task.
        this.events.lostpointercapture?.({ pointerId });
      },
    });
  }
  return elements.get(id);
}
const palettes = [0, 1, 2].map(index => {
  const button = element(`palette-${index}`);
  button.dataset.palette = index;
  return button;
});
// Read selectors and ids from the HTML so localization cannot pass against
// invented nodes or a querySelectorAll stub that returns palettes for everything.
const domIds = new Set(), domNodes = [];
for (const [index, match] of [...html.matchAll(/<([a-z][\w-]*)\b([^>]*)>/gi)].entries()) {
  const attributes = Object.fromEntries([...match[2].matchAll(/([\w-]+)="([^"]*)"/g)].map(value => [value[1], value[2]]));
  if (attributes.id) domIds.add(attributes.id);
  if (!attributes.id && !Object.keys(attributes).some(key => key.startsWith('data-'))) continue;
  const node = 'data-palette' in attributes ? palettes[Number(attributes['data-palette'])] : element(attributes.id || `html-node-${index}`);
  node.tagName = match[1].toUpperCase();
  Object.assign(node.attrs, attributes);
  for (const [key, value] of Object.entries(attributes)) if (key.startsWith('data-')) node.dataset[key.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = value;
  domNodes.push(node);
}
const storedPreferences = new Map();
let storageReadBlocked = false, storageWriteBlocked = false;
global.localStorage = {
  getItem(key) { if (storageReadBlocked) throw Error('Storage unavailable'); return storedPreferences.get(key) ?? null; },
  setItem(key, value) { if (storageWriteBlocked) throw Error('Storage unavailable'); storedPreferences.set(key, value); },
};
global.document = {
  hidden: false, events: {}, activeElement: { tagName: 'CANVAS' },
  title: html.match(/<title>([^<]*)<\/title>/)[1], documentElement: { lang: 'zh-CN' },
  getElementById(id) { assert.ok(domIds.has(id), `Missing HTML element: ${id}`); return element(id); },
  querySelectorAll(selector) {
    const selectors = { '[data-palette]': 'palette', '[data-language]': 'language', '[data-i18n]': 'i18n', '[data-i18n-aria]': 'i18nAria' };
    assert.ok(selector in selectors, `Unsupported harness selector: ${selector}`);
    return domNodes.filter(node => selectors[selector] in node.dataset);
  },
  addEventListener(type, callback) { this.events[type] = callback; },
};
global.window = { events: {}, addEventListener(type, callback) { this.events[type] = callback; } };
global.matchMedia = () => ({ matches: false });
global.setTimeout = () => 0; // Do not start main() or badge timers in this harness.
global.clearTimeout = () => {};
global.requestAnimationFrame = () => 0;
global.cancelAnimationFrame = () => {};
const api = new Function(script + `
  sim=new SoftBody();skin=new Skin(sim);camera=new Camera();camera.update(1400/900);
  renderer={palette:0,mesh:false,draw(){}};ready=true;controls();
  if(typeof renderLanguage==='function')renderLanguage();
  return {sim,skin,camera,renderer,registerJellyTools,frame,getSlow:()=>slow,getReady:()=>ready,
    setLanguage:typeof setLanguage==='function'?setLanguage:null,
    initializeLanguage:typeof initializeLanguage==='function'?initializeLanguage:null,
    getLanguage:()=>typeof language==='string'?language:null,fail,
    resetTiming(){last=0;accumulator=0;}};
`)();
let passed = 0;
function pass(name) { passed++; console.log(`PASS ${name}`); }

assert.equal(api.getLanguage(), 'zh-CN', 'Language must safely default to Chinese.');
assert.equal(element('productTitle').textContent, '霸王龙软软糖');
assert.equal(document.title, '霸王龙软软糖 — 材质研究');
assert.ok(html.indexOf('id="languageSwitcher"') < html.indexOf('<fieldset'), 'Language selection must work outside the disabled GPU controls.');
api.setLanguage('en');
assert.equal(document.documentElement.lang, 'en');
assert.equal(element('productTitle').textContent, 'T-Rex Jelly');
assert.equal(element('statusText').textContent, 'WEBGPU · LIVE');
assert.equal(storedPreferences.get('trex-jelly-language'), 'en');
api.setLanguage('zh-CN');
assert.equal(element('productTitle').textContent, '霸王龙软软糖');
pass('Chinese default and complete English language selection outside GPU controls');

storedPreferences.set('trex-jelly-language', 'en');
api.initializeLanguage();
assert.equal(api.getLanguage(), 'en');
storedPreferences.set('trex-jelly-language', 'invalid');
api.initializeLanguage();
assert.equal(api.getLanguage(), 'zh-CN');
storageReadBlocked = true;
api.initializeLanguage();
assert.equal(api.getLanguage(), 'zh-CN');
storageWriteBlocked = true;
assert.doesNotThrow(() => api.setLanguage('en'));
assert.equal(element('productTitle').textContent, 'T-Rex Jelly');
storageReadBlocked = storageWriteBlocked = false;
storedPreferences.clear();
api.initializeLanguage();
pass('saved language restoration and safe unavailable or invalid storage');

// A welded component must include body, limbs, and tail; facial details are
// intentionally separate geometry and use the same deformation field.
const parents = Array.from({ length: api.skin.bodyVertices }, (_, index) => index);
function find(index) {
  while (parents[index] !== index) { parents[index] = parents[parents[index]]; index = parents[index]; }
  return index;
}
for (let i = 0; i < api.skin.bodyCount; i += 3) {
  const root = find(api.skin.indices[i]);
  parents[find(api.skin.indices[i + 1])] = root;
  parents[find(api.skin.indices[i + 2])] = root;
}
assert.equal(new Set(parents.map((_, index) => find(index))).size, 1);
pass('single welded body component, including arms and tail');

const originalPositions = api.sim.p.slice();
for (const [index, button] of palettes.entries()) {
  button.onclick();
  assert.equal(api.renderer.palette, index);
  assert.deepEqual(api.sim.p, originalPositions);
  assert.equal(button.attrs['aria-pressed'], 'true');
}
pass('all palettes preserve simulation and selected state');
element('pause').onclick();
assert.equal(api.sim.paused, true);
api.setLanguage('en');
assert.equal(element('pause').textContent, 'Resume ▷');
assert.equal(element('badge').textContent, 'Taking a tiny breather.');
api.setLanguage('zh-CN');
assert.equal(element('pause').textContent, '继续 ▷');
assert.equal(element('badge').textContent, '小小休息一下。');
api.sim.step(1 / 90);
assert.deepEqual(api.sim.p, originalPositions);
element('pause').onclick();
assert.equal(api.sim.paused, false);
pass('pause/resume');
element('mesh').onchange({ target: { checked: true } });
assert.equal(api.renderer.mesh, true);
element('firmness').oninput({ target: { value: 100 } });
element('damping').oninput({ target: { value: 0 } });
assert.equal(api.sim.firm, 1);
assert.equal(api.sim.damping, 0);
pass('mesh and both settings sliders');

const canvas = element('stage');
const camera = api.camera;
function project(point) {
  const value = [0, 0, 0, 0], source = [...point, 1];
  for (let row = 0; row < 4; row++) for (let column = 0; column < 4; column++) value[row] += camera.vp[column * 4 + row] * source[column];
  return { clientX: (value[0] / value[3] + 1) * 700, clientY: (1 - value[1] / value[3]) * 450, pointerId: 1, button: 0 };
}
let hit = project([-0.25, 1.65, 0.6]);
canvas.events.pointerdown(hit);
assert.ok(api.sim.grab, 'Projected body point should ray-pick the actual surface.');
element('slow').onchange({ target: { checked: true } });
const languageState = { p: api.sim.p.slice(), v: api.sim.v.slice(), grab: api.sim.grab, target: api.sim.grab.target.slice(),
  camera: [camera.yaw, camera.pitch, camera.distance, ...camera.target], palette: api.renderer.palette, paused: api.sim.paused,
  slow: api.getSlow(), mesh: api.renderer.mesh, firm: api.sim.firm, damping: api.sim.damping };
for (const locale of ['en', 'zh-CN']) {
  api.setLanguage(locale);
  assert.deepEqual(api.sim.p, languageState.p);
  assert.deepEqual(api.sim.v, languageState.v);
  assert.ok(api.sim.grab === languageState.grab);
  assert.deepEqual(api.sim.grab.target, languageState.target);
  assert.deepEqual([camera.yaw, camera.pitch, camera.distance, ...camera.target], languageState.camera);
  assert.deepEqual([api.renderer.palette, api.sim.paused, api.getSlow(), api.renderer.mesh, api.sim.firm, api.sim.damping],
    [languageState.palette, languageState.paused, languageState.slow, languageState.mesh, languageState.firm, languageState.damping]);
}
element('slow').onchange({ target: { checked: false } });
pass('language switching preserves active local grab, physics, palette and view settings');
const yawBeforeGrab = camera.yaw, zoomBeforeGrab = camera.distance;
const grabPoint = api.sim.grab.target.slice();
canvas.events.pointermove({ ...hit, clientX: hit.clientX + 600, clientY: hit.clientY - 300 });
assert.equal(camera.yaw, yawBeforeGrab);
assert.ok(api.sim.grab.target.every(Number.isFinite));
assert.ok(Math.hypot(...api.sim.grab.target.map((value, index) => value - grabPoint[index])) <= 2.60001);
canvas.events.wheel({ preventDefault() {}, deltaY: -500 });
window.events.keydown({ key: 'ArrowRight', code: 'ArrowRight', preventDefault() {} });
window.events.keydown({ key: '+', code: 'Equal', preventDefault() {} });
assert.equal(camera.yaw, yawBeforeGrab);
assert.equal(camera.distance, zoomBeforeGrab);
canvas.events.pointerup(hit);
assert.equal(api.sim.grab, null);
pass('actual ray pick, bounded object pull, release, camera input separation');

canvas.events.pointerdown({ clientX: 10, clientY: 400, pointerId: 1, button: 2 });
canvas.events.pointermove({ clientX: 180, clientY: 450, pointerId: 1 });
assert.notEqual(camera.yaw, yawBeforeGrab);
canvas.events.pointerup({ pointerId: 1 });
for (let i = 0; i < 20; i++) canvas.events.wheel({ preventDefault() {}, deltaY: 999 });
assert.equal(camera.distance, 12.5);
for (let i = 0; i < 20; i++) canvas.events.wheel({ preventDefault() {}, deltaY: -999 });
assert.equal(camera.distance, 6.4);
pass('right-button orbit and both zoom limits');

element('view').onclick();
camera.update(1400 / 900);
hit = project([-0.25, 1.65, 0.6]);
canvas.events.pointerdown({ ...hit, pointerType: 'touch' });
assert.ok(api.sim.grab);
canvas.events.pointerdown({ ...hit, pointerId: 2, pointerType: 'touch', clientX: hit.clientX + 100 });
assert.equal(api.sim.grab, null);
const beforePinch = camera.distance;
canvas.events.pointermove({ ...hit, pointerId: 2, clientX: hit.clientX + 200 });
assert.ok(camera.distance < beforePinch && camera.distance >= 6.4);
canvas.events.pointercancel({ pointerId: 2 });
canvas.events.pointerup({ pointerId: 1 });
pass('simulated two-pointer pinch cancels object grab and touch cancel releases');

element('view').onclick();
camera.update(1400 / 900);
hit = project([-0.25, 1.65, 0.6]);
canvas.events.pointerdown(hit);
assert.ok(api.sim.grab);
window.events.blur();
assert.equal(api.sim.grab, null);
assert.equal(canvas.classList.contains('grabbing'), false);
canvas.events.pointermove({ ...hit, clientX: hit.clientX + 200 });
assert.equal(api.sim.grab, null);
canvas.events.pointerdown(hit);
assert.ok(api.sim.grab);
document.events.visibilitychange();
assert.equal(api.sim.grab, null);
assert.equal(canvas.classList.contains('grabbing'), false);
pass('blur and visibility changes cancel pointer state');

// An old captured finger may end after reset while another finger has already
// started a fresh grab. Its delayed events must not cancel the current gesture.
canvas.events.pointerdown({ ...hit, pointerId: 91 });
assert.ok(api.sim.grab);
element('reset').onclick();
canvas.events.pointerdown({ ...hit, pointerId: 92 });
const currentGrab = api.sim.grab;
assert.ok(currentGrab);
canvas.events.pointerup({ pointerId: 91 });
assert.ok(api.sim.grab === currentGrab, 'An old pointerup must preserve the new grab.');
canvas.events.lostpointercapture({ pointerId: 91 });
assert.ok(api.sim.grab === currentGrab, 'An old lostpointercapture must preserve the new grab.');
const targetBeforeMove = currentGrab.target.slice();
canvas.events.pointermove({ ...hit, pointerId: 92, clientX: hit.clientX + 80 });
assert.notDeepEqual(api.sim.grab.target, targetBeforeMove);
canvas.events.pointerup({ pointerId: 92 });
pass('delayed events from a reset pointer preserve a newer grab');

canvas.events.pointerdown({ ...hit, pointerId: 93 });
canvas.events.pointerdown({ ...hit, pointerId: 94, clientX: hit.clientX + 100 });
element('reset').onclick();
assert.equal(canvas.hasPointerCapture(93), false, 'Reset must release the first capture.');
assert.equal(canvas.hasPointerCapture(94), false, 'Reset must release the second capture.');
assert.deepEqual(canvas.releasedPointers.slice(-2), [93, 94]);
for (const [pointerId, interrupt] of [[95, () => window.events.blur()], [96, () => window.events.resize()]]) {
  canvas.events.pointerdown({ ...hit, pointerId });
  assert.ok(api.sim.grab);
  interrupt();
  assert.equal(canvas.hasPointerCapture(pointerId), false);
  assert.equal(api.sim.grab, null);
  assert.equal(canvas.classList.contains('grabbing'), false);
}
canvas.events.pointerdown({ ...hit, pointerId: 97 });
canvas.capturedPointers.delete(97); // The browser may already have dropped it.
element('pause').onclick();
assert.equal(api.sim.grab, null);
assert.ok(!canvas.releasedPointers.includes(97), 'Do not release a capture the canvas no longer owns.');
element('pause').onclick();
pass('reset, blur and resize release captures; pause tolerates an already lost capture');

element('nudge').onclick();
assert.ok(api.sim.v.some(value => value !== 0));
element('reset').onclick();
assert.deepEqual(api.sim.p, api.sim.rest);
assert.ok(api.sim.v.every(value => value === 0));
const shapeBeforeViewReset = api.sim.p.slice();
camera.yaw = 1.2; camera.pitch = 0.5;
element('view').onclick();
assert.equal(camera.yaw, 0.38);
assert.equal(camera.pitch, 0.14);
assert.deepEqual(api.sim.p, shapeBeforeViewReset);
pass('nudge, exact shape reset, view reset without shape reset');

const originalStep = api.sim.step;
let stepCount = 0;
api.sim.step = function (dt) { stepCount++; return originalStep.call(this, dt); };
function frameSteps(quarterSpeed) {
  api.sim.reset(); api.resetTiming(); stepCount = 0;
  element('slow').onchange({ target: { checked: quarterSpeed } });
  for (let i = 1; i <= 60; i++) api.frame(i * 1000 / 60);
  return stepCount;
}
const fullSpeedSteps = frameSteps(false), quarterSpeedSteps = frameSteps(true);
assert.ok(Math.abs(quarterSpeedSteps - fullSpeedSteps / 4) <= 1);
assert.ok(fullSpeedSteps >= 89 && fullSpeedSteps <= 90);
api.sim.step = originalStep;
pass(`quarter-speed fixed stepping (${fullSpeedSteps} versus ${quarterSpeedSteps} steps)`);

const tools = new Map();
document.modelContext = { registerTool(tool) { tools.set(tool.name, tool); } };
api.registerJellyTools();
assert.deepEqual([...tools.keys()], ['read_jelly_state', 'configure_jelly', 'control_jelly']);
const configure = tools.get('configure_jelly');
configure.execute({ material: 'Lagoon', firmness: 20, internalDamping: 45, quarterSpeed: false, showMesh: false });
assert.equal(api.renderer.palette, 1);
assert.equal(api.sim.firm, 0.2);
assert.equal(api.sim.damping, 0.45);
const toolState = tools.get('read_jelly_state').execute();
assert.throws(() => configure.execute({ material: 'Grape', firmness: 120 }));
assert.deepEqual(tools.get('read_jelly_state').execute(), toolState);
const control = tools.get('control_jelly');
control.execute({ action: 'pause' });
control.execute({ action: 'pause' });
assert.equal(api.sim.paused, true);
control.execute({ action: 'resume' });
assert.equal(api.sim.paused, false);
assert.throws(() => control.execute({ action: 'reset', unknown: true }));
pass('optional tool hooks validate before mutation and use UI state');

camera.update(1400 / 900);
canvas.events.pointerdown({ ...project([-0.25, 1.65, 0.6]), pointerId: 98 });
assert.ok(api.sim.grab);
assert.equal(canvas.hasPointerCapture(98), true);
api.sim.paused = true;
api.renderer.draw = () => { throw Error('Expected test rendering interruption'); };
const savedConsoleError = console.error;
const capturedErrors = [];
try {
  console.error = error => capturedErrors.push(error);
  api.frame(performance.now());
} finally { console.error = savedConsoleError; }
assert.equal(capturedErrors.length, 1);
assert.equal(api.getReady(), false);
assert.equal(element('controls').disabled, true);
assert.equal(element('fallback').hidden, false);
assert.equal(element('statusText').textContent, 'WEBGPU 不可用');
assert.ok(api.sim.grab === null, 'Rendering failure must cancel the active grab.');
assert.equal(canvas.classList.contains('grabbing'), false);
assert.equal(canvas.hasPointerCapture(98), false);
pass('render interruption shows fallback and releases the active grab and capture');
element('languageEn').onclick();
assert.equal(element('statusText').textContent, 'WEBGPU UNAVAILABLE');
assert.match(element('fallbackReason').textContent, /Reload to restore/);
assert.equal(element('fallbackTitle').textContent, 'This jelly needs WebGPU.');
api.fail('GPU validation detail', 'renderFailed');
element('languageZh').onclick();
assert.equal(element('fallbackTitle').textContent, '这只软糖需要 WebGPU。');
assert.match(element('fallbackReason').textContent, /渲染失败/);
assert.match(element('fallbackReason').textContent, /GPU validation detail/);
assert.equal(element('controls').disabled, true);
pass('language switching translates unavailable status and fallback while retaining GPU diagnostics');
console.log(`PASS: ${passed} Node/DOM-harness checks. No browser, real touch, CSS layout, WGSL compilation, or GPU rendering was exercised.`);
