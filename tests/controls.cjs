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
function classList() {
  return { values: new Set(), add(...values) { values.forEach(value => this.values.add(value)); },
    remove(...values) { values.forEach(value => this.values.delete(value)); }, contains(value) { return this.values.has(value); } };
}
function addEventListener(type, callback) {
  this.listeners ??= {};
  (this.listeners[type] ??= []).push(callback);
  this.events[type] = (event = {}) => {
    const preventDefault = event.preventDefault;
    event.preventDefault = () => { event.defaultPrevented = true; preventDefault?.call(event); };
    if (type === 'lostpointercapture') this.capturedPointers?.delete(event.pointerId);
    for (const listener of this.listeners[type]) listener(event);
    // The browser implicitly drops capture after a pointer ends. The separate
    // releasePointerCapture method still tests explicit interruption cleanup.
    if (['pointerup', 'pointercancel'].includes(type) && this.capturedPointers?.delete(event.pointerId)) this.events.lostpointercapture?.({ pointerId: event.pointerId });
    return event;
  };
}
function element(id) {
  if (!elements.has(id)) {
    elements.set(id, {
      id, value: '55', checked: false, disabled: false, hidden: false, dataset: {}, tagName: 'CANVAS',
      style: { setProperty(key, value) { this[key] = String(value); }, getPropertyValue(key) { return this[key] ?? ''; } },
      events: {}, attrs: {}, width: 1400, height: 900, children: [], parentElement: null, _text: '',
      classList: classList(), addEventListener,
      setAttribute(key, value) {
        this.attrs[key] = String(value);
        if (key === 'class') { this.classList.values.clear(); String(value).split(/\s+/).filter(Boolean).forEach(name => this.classList.add(name)); }
      },
      get textContent() { return this._text + this.children.map(child => child.textContent).join(''); },
      set textContent(value) { this._text = String(value); this.children.forEach(child => child.parentElement = null); this.children = []; },
      get isConnected() { let node = this; while (node.parentElement) node = node.parentElement; return node.tagName === 'HTML'; },
      getBoundingClientRect() { return { left: 0, top: 0, width: 1400, height: 900 }; },
      capturedPointers: new Set(), releasedPointers: [],
      focus() {
        for (let node = this; node; node = node.parentElement) if (node.hidden || node.disabled) return;
        if (this.isConnected) document.activeElement = this;
      },
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
// Read the actual element tree. Setting a parent's textContent must remove its
// icon children, and a hidden or disabled panel must not accept focus.
const domIds = new Set(), domNodes = [];
const stack = [], markup = html.slice(0, html.indexOf('<script>')).replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '<style></style>');
for (const [index, match] of [...markup.matchAll(/<(\/?)([a-z][\w-]*)\b([^>]*)>|([^<]+)/gi)].entries()) {
  if (match[4]) { if (stack.length) stack.at(-1)._text += match[4]; continue; }
  if (match[1]) { assert.equal(stack.pop()?.tagName, match[2].toUpperCase(), 'Harness requires properly nested HTML.'); continue; }
  const attributes = Object.fromEntries([...match[3].matchAll(/([\w-]+)(?:="([^"]*)")?/g)].map(value => [value[1], value[2] ?? '']));
  if (attributes.id) domIds.add(attributes.id);
  const node = 'data-palette' in attributes ? palettes[Number(attributes['data-palette'])] : element(attributes.id || `html-node-${index}`);
  node.id = attributes.id || '';
  node.tagName = match[2].toUpperCase();
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  node.hidden = 'hidden' in attributes; node.disabled = 'disabled' in attributes; node.checked = 'checked' in attributes;
  if ('value' in attributes) node.value = attributes.value;
  for (const [key, value] of Object.entries(attributes)) if (key.startsWith('data-')) node.dataset[key.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = value;
  if (stack.length) { node.parentElement = stack.at(-1); stack.at(-1).children.push(node); }
  domNodes.push(node);
  if (!['AREA', 'BASE', 'BR', 'COL', 'EMBED', 'HR', 'IMG', 'INPUT', 'LINK', 'META', 'PARAM', 'SOURCE', 'TRACK', 'WBR'].includes(node.tagName)) stack.push(node);
}
const storedPreferences = new Map();
let storageReadBlocked = false, storageWriteBlocked = false;
global.localStorage = {
  getItem(key) { if (storageReadBlocked) throw Error('Storage unavailable'); return storedPreferences.get(key) ?? null; },
  setItem(key, value) { if (storageWriteBlocked) throw Error('Storage unavailable'); storedPreferences.set(key, value); },
};
global.document = {
  hidden: false, events: {}, activeElement: element('stage'),
  title: html.match(/<title>([^<]*)<\/title>/)[1], documentElement: domNodes.find(node => node.tagName === 'HTML'),
  getElementById(id) { assert.ok(domIds.has(id), `Missing HTML element: ${id}`); assert.ok(element(id).isConnected, `Detached HTML element: ${id}`); return element(id); },
  querySelectorAll(selector) {
    const selectors = { '[data-palette]': 'palette', '[data-language]': 'language', '[data-i18n]': 'i18n', '[data-i18n-aria]': 'i18nAria' };
    assert.ok(selector in selectors, `Unsupported harness selector: ${selector}`);
    return domNodes.filter(node => node.isConnected && selectors[selector] in node.dataset);
  },
  addEventListener,
};
global.window = { events: {}, addEventListener };
global.matchMedia = () => ({ matches: false });
global.setTimeout = () => 0; // Do not start main() or badge timers in this harness.
global.clearTimeout = () => {};
global.requestAnimationFrame = () => 0;
global.cancelAnimationFrame = () => {};
const api = new Function(script + `
  sim=new SoftBody();skin=new Skin(sim);camera=new Camera();camera.update(1400/900);
  renderer={backend:'webgpu',palette:0,mesh:false,draw(){}};ready=true;$('controls').disabled=false;controls();
  if(typeof renderLanguage==='function')renderLanguage();
  return {sim,skin,camera,renderer,registerJellyTools,jellyState,frame,getSlow:()=>slow,getReady:()=>ready,
    getMinDistance:()=>minDistance(),getMaxDistance:()=>maxDistance(),
    setLanguage:typeof setLanguage==='function'?setLanguage:null,
    initializeLanguage:typeof initializeLanguage==='function'?initializeLanguage:null,
    getLanguage:()=>typeof language==='string'?language:null,fail,setTuning,getTuning:()=>tuningOpen,
    resetTiming(){last=0;accumulator=0;}};
`)();
let passed = 0;
function pass(name) { passed++; console.log(`PASS ${name}`); }

assert.equal(api.getLanguage(), 'zh-CN', 'Language must safely default to Chinese.');
assert.equal(element('productTitle').textContent, '霸王龙软软糖');
assert.equal(document.title, '霸王龙软软糖 — 软软糖乐园');
assert.ok(html.indexOf('id="languageSwitcher"') < html.indexOf('<fieldset'), 'Language selection must work outside the disabled GPU controls.');
api.setLanguage('en');
assert.equal(document.documentElement.lang, 'en');
assert.equal(element('productTitle').textContent, 'T-Rex Jelly');
assert.equal(document.title, 'T-Rex Jelly — Jelly Playground');
assert.equal(element('statusText').textContent, 'Ready to play');
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
const pauseIcon = element('pauseIcon');
element('pause').onclick();
assert.equal(api.sim.paused, true);
api.setLanguage('en');
assert.equal(element('pauseLabel').textContent, 'Play on');
assert.equal(element('badge').textContent, 'A little rest. Come back soon.');
assert.equal(element('statusText').textContent, 'Taking a break');
assert.equal(pauseIcon.attrs.class, 'toy-icon icon-play');
api.setLanguage('zh-CN');
assert.equal(element('pauseLabel').textContent, '继续玩');
assert.equal(element('badge').textContent, '休息一下，等你回来。');
assert.equal(element('statusText').textContent, '休息一下');
assert.equal(pauseIcon.parentElement, element('pause'), 'Pause localization must retain the 3D icon node.');
api.sim.step(1 / 90);
assert.deepEqual(api.sim.p, originalPositions);
element('pause').onclick();
assert.equal(api.sim.paused, false);
assert.equal(element('pauseLabel').textContent, '暂停');
assert.equal(pauseIcon.attrs.class, 'toy-icon icon-pause');
assert.equal(element('statusText').textContent, '可以玩啦');
pass('pause/resume label, persistent status and retained 3D icon');
element('mesh').onchange({ target: { checked: true } });
assert.equal(api.renderer.mesh, true);
element('firmness').oninput({ target: { value: 100 } });
element('damping').oninput({ target: { value: 0 } });
assert.equal(api.sim.firm, 1);
assert.equal(api.sim.damping, 0);
assert.equal(element('firmness').style.getPropertyValue('--level'), '100%');
assert.equal(element('damping').style.getPropertyValue('--level'), '0%');
pass('mesh and both settings sliders');

const canvas = element('stage');
const camera = api.camera;
assert.deepEqual(api.jellyState().diagnostics, { mode: null, pointerCount: 0, lastPointer: null, lastGrab: null, grabCount: 0,
  camera: { yaw: camera.yaw, pitch: camera.pitch, distance: camera.distance }, activeGrabCount: 0, activeGrabs: [] });
function project(point) {
  const value = [0, 0, 0, 0], source = [...point, 1];
  for (let row = 0; row < 4; row++) for (let column = 0; column < 4; column++) value[row] += camera.vp[column * 4 + row] * source[column];
  return { clientX: (value[0] / value[3] + 1) * 700, clientY: (1 - value[1] / value[3]) * 450, pointerId: 1, button: 0 };
}
let hit = project([-0.25, 1.65, 0.6]);
canvas.events.pointerdown(hit);
assert.ok(api.sim.grab, 'Projected body point should ray-pick the actual surface.');
const grabDiagnostics = api.jellyState().diagnostics;
assert.equal(grabDiagnostics.mode, 'grab');
assert.equal(grabDiagnostics.pointerCount, 1);
assert.equal(grabDiagnostics.grabCount, 1);
assert.equal(grabDiagnostics.lastGrab.sequence, 1);
assert.deepEqual(grabDiagnostics.lastGrab.rest, api.skin.pick(camera.eye, camera.ray(hit.clientX, hit.clientY, canvas.getBoundingClientRect())).rest);
assert.deepEqual(grabDiagnostics.lastPointer, { pointerId: 1, pointerType: 'mouse', x: hit.clientX, y: hit.clientY, width: 1400, height: 900,
  button: 0, buttons: null, isPrimary: null, contactWidth: 1, contactHeight: 1, pressure: null });
assert.equal(grabDiagnostics.lastGrab.x, hit.clientX);
assert.equal(grabDiagnostics.lastGrab.y, hit.clientY);
grabDiagnostics.lastGrab.rest[0] = 999;
grabDiagnostics.lastPointer.x = -999;
assert.notEqual(api.jellyState().diagnostics.lastGrab.rest[0], 999, 'Read-only diagnostics must return copies of internal coordinates.');
assert.equal(api.jellyState().diagnostics.lastPointer.x, hit.clientX);
pass('read-only diagnostics report the actual grabbed rest location and defensively copied canvas coordinates');
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
const pullDistance = Math.hypot(...api.sim.grab.target.map((value, index) => value - grabPoint[index]));
assert.ok(pullDistance > 3 && pullDistance <= 3.80001, 'A long drag must allow a visibly longer, still bounded pull.');
canvas.events.wheel({ preventDefault() {}, deltaY: -500 });
window.events.keydown({ key: 'ArrowRight', code: 'ArrowRight', preventDefault() {} });
window.events.keydown({ key: '+', code: 'Equal', preventDefault() {} });
assert.equal(camera.yaw, yawBeforeGrab);
assert.equal(camera.distance, zoomBeforeGrab);
canvas.events.pointerup(hit);
assert.equal(api.sim.grab, null);
assert.equal(api.jellyState().diagnostics.mode, null);
assert.equal(api.jellyState().diagnostics.pointerCount, 0);
assert.equal(api.jellyState().diagnostics.lastGrab.sequence, 1, 'Release must retain the last verified hit for review.');
pass('actual ray pick, bounded object pull, release, camera input separation');

canvas.events.pointerdown({ clientX: 10, clientY: 400, pointerId: 1, button: 2 });
assert.equal(api.jellyState().diagnostics.mode, 'orbit');
assert.equal(api.jellyState().diagnostics.pointerCount, 1);
assert.equal(api.jellyState().diagnostics.grabCount, 1, 'Orbit events must never be counted as object pulls.');
canvas.events.pointermove({ clientX: 180, clientY: 450, pointerId: 1 });
assert.notEqual(camera.yaw, yawBeforeGrab);
canvas.events.pointerup({ pointerId: 1 });
for (let i = 0; i < 20; i++) canvas.events.wheel({ preventDefault() {}, deltaY: 999 });
assert.equal(camera.distance, api.getMaxDistance());
for (let i = 0; i < 20; i++) canvas.events.wheel({ preventDefault() {}, deltaY: -999 });
assert.equal(camera.distance, api.getMinDistance());
pass('right-button orbit and both zoom limits');

element('view').onclick();
camera.update(1400 / 900);
hit = project([-0.25, 1.65, 0.6]);
canvas.events.pointerdown({ ...hit, pointerType: 'touch' });
assert.ok(api.sim.grab);
const firstGrab = api.sim.grab, headHit = { ...project([1.25, 3.02, .45]), pointerId: 2, pointerType: 'touch' };
const dualCamera = [camera.yaw, camera.pitch, camera.distance];
canvas.events.pointerdown(headHit);
assert.ok(api.sim.grab === firstGrab, 'A second dinosaur hit must preserve the first local grab.');
assert.equal(api.sim.grabs.size, 2, 'Each finger must own an independent local constraint.');
const dualDiagnostics = api.jellyState().diagnostics;
assert.equal(dualDiagnostics.activeGrabCount, 2);
assert.deepEqual(dualDiagnostics.activeGrabs.map(grab => grab.pointerId), [1, 2]);
dualDiagnostics.activeGrabs[0].target[0] = 999;
dualDiagnostics.activeGrabs[0].rest[0] = 999;
assert.notEqual(api.sim.grab.target[0], 999, 'Active grab diagnostics must return copied targets.');
assert.notEqual(api.jellyState().diagnostics.activeGrabs[0].rest[0], 999);
const secondGrab = api.sim.grabs.get(2), firstTarget = firstGrab.target.slice(), secondTarget = secondGrab.target.slice();
assert.notDeepEqual(secondGrab.bind.ids, firstGrab.bind.ids, 'Two distant hits must bind different local nodes.');
canvas.events.pointermove({ ...hit, pointerType: 'touch', clientX: hit.clientX - 180 });
assert.notDeepEqual(firstGrab.target, firstTarget);
assert.deepEqual(secondGrab.target, secondTarget, 'Moving one finger must not overwrite the other target.');
const firstAfterMove = firstGrab.target.slice();
canvas.events.pointermove({ ...headHit, clientX: headHit.clientX + 180 });
assert.notDeepEqual(secondGrab.target, secondTarget);
assert.deepEqual(firstGrab.target, firstAfterMove);
assert.deepEqual([camera.yaw, camera.pitch, camera.distance], dualCamera, 'Two object pulls must never orbit or zoom the view.');
canvas.events.pointerdown({ ...project([-2.6, 1.55, .1]), pointerId: 3, pointerType: 'touch' });
canvas.events.pointermove({ ...headHit, pointerId: 3, clientX: headHit.clientX + 300 });
assert.equal(api.sim.grabs.size, 2, 'A third finger must not create a third constraint or cancel existing pulls.');
assert.deepEqual([camera.yaw, camera.pitch, camera.distance], dualCamera);
canvas.events.pointerup({ pointerId: 3 });
canvas.events.pointerup({ pointerId: 1 });
assert.equal(api.sim.grabs.size, 1);
assert.ok(api.sim.grab === secondGrab, 'Releasing one hand must retain the other constraint.');
const survivingTarget = secondGrab.target.slice();
canvas.events.pointermove({ ...headHit, clientX: headHit.clientX + 230 });
assert.notDeepEqual(secondGrab.target, survivingTarget, 'The surviving hand must continue pulling.');
canvas.events.pointerup({ pointerId: 2 });
assert.equal(api.sim.grabs.size, 0);
assert.equal(api.sim.grab, null);
assert.equal(canvas.capturedPointers.size, 0);
pass('two true object hits pull independent local nodes, ignore a third finger and retain a surviving hand without camera movement');

canvas.events.pointerdown({ ...hit, pointerId: 11, pointerType: 'touch' });
const mixedGrab = api.sim.grab, mixedTarget = mixedGrab.target.slice();
canvas.events.pointerdown({ clientX: 20, clientY: 400, pointerId: 12, button: 0, pointerType: 'touch' });
canvas.events.pointermove({ clientX: 220, clientY: 450, pointerId: 12, pointerType: 'touch' });
assert.ok(api.sim.grab === mixedGrab, 'A blank second touch must retain the object grab.');
assert.deepEqual(mixedGrab.target, mixedTarget);
assert.deepEqual([camera.yaw, camera.pitch, camera.distance], dualCamera, 'A mixed object/blank gesture must not become camera zoom.');
canvas.events.pointercancel({ pointerId: 11 });
assert.equal(api.sim.grabs.size, 0, 'Touch cancellation must clear the complete interrupted object gesture.');
assert.equal(canvas.capturedPointers.size, 0);
canvas.events.pointerup({ pointerId: 12 });
pass('mixed object and blank touches preserve the pull and cancellation releases every capture');

canvas.events.pointerdown({ clientX: 20, clientY: 400, pointerId: 21, button: 0, pointerType: 'touch' });
canvas.events.pointermove({ clientX: 180, clientY: 440, pointerId: 21, pointerType: 'touch' });
assert.deepEqual([camera.yaw, camera.pitch, camera.distance], dualCamera, 'A missed single touch must not move the floor by orbiting the camera.');
canvas.events.pointerup({ pointerId: 21 });
pass('blank single-finger touch keeps the camera still');

canvas.events.pointerdown({ clientX: 20, clientY: 400, pointerId: 25, button: 0, pointerType: 'touch' });
canvas.events.pointerdown({ ...hit, pointerId: 26, pointerType: 'touch' });
assert.equal(api.sim.grabs.size, 1, 'Blank then object must create one local grab rather than pinch.');
canvas.events.pointermove({ clientX: 220, clientY: 450, pointerId: 25, pointerType: 'touch' });
assert.deepEqual([camera.yaw, camera.pitch, camera.distance], dualCamera);
canvas.events.pointercancel({ pointerId: 25 });
assert.equal(api.sim.grabs.size, 0);
assert.equal(canvas.capturedPointers.size, 0);
pass('blank then object touch also locks the camera and cancellation clears the interrupted gesture');

canvas.events.pointerdown({ ...hit, pointerId: 27, pointerType: 'touch' });
canvas.events.pointerdown({ ...headHit, pointerId: 28, pointerType: 'touch' });
const captureSurvivor = api.sim.grabs.get(28);
const capturedTarget = captureSurvivor.target.slice();
canvas.events.lostpointercapture({ pointerId: 27 });
assert.equal(api.sim.grabs.size, 1);
assert.equal(api.sim.grab, captureSurvivor, 'Losing one pointer capture must retain the other owned grab.');
canvas.events.pointermove({ ...headHit, pointerId: 28, clientX: headHit.clientX + 100 });
assert.notDeepEqual(captureSurvivor.target, capturedTarget);
canvas.events.pointercancel({ pointerId: 28 });
assert.equal(api.sim.grabs.size, 0);
assert.equal(canvas.capturedPointers.size, 0);
pass('one lost capture preserves the surviving local grab and the final interruption cleans up');

for (const [name, interrupt] of [
  ['blur', () => window.events.blur()], ['visibility', () => document.events.visibilitychange()],
  ['resize', () => window.events.resize()], ['pause', () => { element('pause').onclick(); element('pause').onclick(); }],
  ['reset', () => element('reset').onclick()], ['cancel', () => canvas.events.pointercancel({ pointerId: 31 })],
]) {
  canvas.events.pointerdown({ ...hit, pointerId: 31, pointerType: 'touch' });
  canvas.events.pointerdown({ ...headHit, pointerId: 32, pointerType: 'touch' });
  assert.equal(api.sim.grabs.size, 2, name + ' fixture must own both grabs.');
  interrupt();
  assert.equal(api.sim.grabs.size, 0, name + ' must clear both local constraints.');
  assert.equal(canvas.capturedPointers.size, 0, name + ' must release every capture.');
  assert.equal(api.jellyState().diagnostics.pointerCount, 0);
  canvas.events.pointerup({ pointerId: 31 }); canvas.events.pointerup({ pointerId: 32 });
}
pass('dual grabs clean up on cancellation, blur, visibility, resize, pause and reset');

// Phone-size tests use the real generated/deformed triangles and CSS-coordinate
// contact geometry. These are Node event simulations, not Android hardware.
const oldRect = canvas.getBoundingClientRect, oldCanvasSize = [canvas.width, canvas.height], oldMedia = global.matchMedia;
const phoneRect = { left: 13, top: 112, width: 390, height: 430 };
canvas.getBoundingClientRect = () => phoneRect; canvas.width = 390; canvas.height = 430;
global.matchMedia = () => ({ matches: true });
element('view').onclick(); camera.update(canvas.width / canvas.height);
api.sim.reset(); api.skin.update();
function phoneProject(point) {
  const value = [0, 0, 0, 0], source = [...point, 1];
  for (let row = 0; row < 4; row++) for (let column = 0; column < 4; column++) value[row] += camera.vp[column * 4 + row] * source[column];
  return { clientX: phoneRect.left + (value[0] / value[3] + 1) * phoneRect.width / 2,
    clientY: phoneRect.top + (1 - value[1] / value[3]) * phoneRect.height / 2 };
}
const touchPacket = (point, pointerId, isPrimary) => ({ ...point, pointerId, pointerType: 'touch', button: 0, buttons: 1,
  isPrimary, width: 24, height: 24, pressure: .55 });
const phoneHead = touchPacket(phoneProject([1.25, 3.02, .45]), 401, true);
const phoneBody = touchPacket(phoneProject([-.25, 1.65, .6]), 402, false);
canvas.events.pointerdown(phoneHead); canvas.events.pointerdown(phoneBody);
assert.equal(api.sim.grabs.size, 2, 'A standards-shaped non-primary touch contact must be accepted independently.');
const secondaryTarget = api.sim.grabs.get(402).target.slice();
canvas.events.pointermove({ ...phoneBody, button: -1, clientX: phoneBody.clientX + 10 });
assert.notDeepEqual(api.sim.grabs.get(402).target, secondaryTarget, 'Touch move button=-1 must not suppress the second hand.');
assert.deepEqual(Object.fromEntries(['pointerType', 'button', 'buttons', 'isPrimary', 'contactWidth', 'contactHeight', 'pressure'].map(key => [key, api.jellyState().diagnostics.lastPointer[key]])),
  { pointerType: 'touch', button: -1, buttons: 1, isPrimary: false, contactWidth: 24, contactHeight: 24, pressure: .55 }, 'Read-only diagnostics must retain the actual touch event shape for device investigation.');
canvas.events.pointercancel({ pointerId: 401 });
pass('phone-sized primary and non-primary touch packets retain independent grabs with standard move button state');

const tailCenter = phoneProject([-2.7, 1.8, .04]);
const rawPhonePick = point => api.skin.pick(camera.eye, camera.ray(point.clientX, point.clientY, phoneRect));
let phoneNearMiss;
findContact: for (let dx = -14; dx <= 14; dx += 2) for (let dy = -14; dy <= 14; dy += 2) {
  const point = { clientX: tailCenter.clientX + dx, clientY: tailCenter.clientY + dy };
  if (rawPhonePick(point)) continue;
  for (const [ox, oy] of [[12, 0], [-12, 0], [0, 12], [0, -12]]) {
    const contactHit = rawPhonePick({ clientX: point.clientX + ox, clientY: point.clientY + oy });
    if (contactHit && contactHit.rest[0] < -2.3) { phoneNearMiss = touchPacket(point, 402, false); break findContact; }
  }
}
assert.ok(phoneNearMiss, 'The phone fixture must exhibit a real thin-tail center miss inside a 24px contact area.');
assert.equal(rawPhonePick(phoneNearMiss), null);
canvas.events.pointerdown(phoneHead); canvas.events.pointerdown(phoneNearMiss);
assert.equal(api.sim.grabs.size, 2, 'A finger pad touching a visible tail must create the second local grab even when its center ray misses.');
const paddedGrab = api.sim.grabs.get(402);
assert.ok(paddedGrab.rest[0] < -2.3, 'Touch tolerance must still bind the locally hit tail material.');
console.log('Phone tail contact fixture:', JSON.stringify({ stage: phoneRect, cameraDistance: camera.distance,
  tailCenter, fingerCenter: { clientX: phoneNearMiss.clientX, clientY: phoneNearMiss.clientY }, contact: [phoneNearMiss.width, phoneNearMiss.height],
  centerRayHit: false, pickOffset: api.jellyState().diagnostics.lastGrab.pickOffset, materialRest: paddedGrab.rest }));
const pickedOffset = api.jellyState().diagnostics.lastGrab.pickOffset;
assert.ok(Math.hypot(...pickedOffset) > 0 && Math.hypot(...pickedOffset) <= 16, 'Touch pickup must report the bounded actual ray offset.');
pickedOffset[0] = 999;
assert.notEqual(api.jellyState().diagnostics.lastGrab.pickOffset[0], 999, 'Diagnostics must return a copy of pickup offsets.');
const padTarget = paddedGrab.target.slice();
canvas.events.pointermove({ ...phoneNearMiss, button: -1 });
assert.ok(paddedGrab.target.every((value, i) => Math.abs(value - padTarget[i]) < 1e-5), 'The first move at the same finger center must not jump to the offset ray.');
assert.equal(element('grabFeedback').hidden, false);
assert.equal(element('grabFeedback').attrs['data-grabs'], '2', 'Successful two-hand input must have visible graphical feedback.');
assert.equal(element('grabRingOne').hidden, false); assert.equal(element('grabRingTwo').hidden, false);
assert.equal(element('grabFeedback').attrs['aria-hidden'], 'true');
canvas.events.pointerup({ pointerId: 401 });
assert.equal(element('grabRingOne').hidden, true); assert.equal(element('grabRingTwo').hidden, false, 'A surviving hand keeps its own colored feedback.');
canvas.events.pointercancel({ pointerId: 402 });
assert.equal(element('grabFeedback').hidden, true);
assert.equal(element('grabRingOne').hidden, true); assert.equal(element('grabRingTwo').hidden, true);
pass('a bounded finger contact hits the thin tail through a real ray and shows two independent grab rings without a target jump');

canvas.events.pointerdown({ ...phoneNearMiss, pointerId: 403, pointerType: 'mouse', width: 24, height: 24 });
assert.equal(api.sim.grabs.size, 0, 'Mouse input must retain precise center-ray picking.');
canvas.events.pointerup({ pointerId: 403 });
canvas.events.pointerdown(touchPacket({ clientX: 20, clientY: 140 }, 404, true));
canvas.events.pointerdown({ ...touchPacket({ clientX: 50, clientY: 140 }, 405, false), width: 100000, height: 100000 });
assert.equal(api.sim.grabs.size, 0, 'An oversized or bogus contact must not reach across blank space to the model.');
assert.equal(api.jellyState().diagnostics.mode, 'pinch');
assert.equal(element('grabFeedback').hidden, true);
canvas.events.pointercancel({ pointerId: 404 });
pass('touch tolerance remains bounded while mouse precision and two genuinely blank touches are preserved');

// Move the actual volume before the second touch, then bind the currently
// visible surface. Picking an undeformed rest mesh would attach the wrong part.
canvas.events.pointerdown(phoneHead);
canvas.events.pointermove({ ...phoneHead, button: -1, clientX: phoneHead.clientX + 25 });
for (let i = 0; i < 12; i++) api.sim.step(1 / 90);
api.skin.update();
const bodyBind = api.sim.binding([-.25, 1.65, .5]), movedBody = touchPacket(phoneProject(api.sim.map(bodyBind)), 402, false);
const deformedHit = rawPhonePick(movedBody);
assert.ok(deformedHit, 'The delayed second touch fixture must hit the current deformed mesh.');
canvas.events.pointerdown(movedBody);
assert.equal(api.sim.grabs.size, 2);
assert.deepEqual(api.sim.grabs.get(402).rest, deformedHit.rest, 'Delayed pickup must preserve the ray-hit material position from the current mesh.');
assert.equal(element('grabFeedback').attrs['data-grabs'], '2');
window.events.blur();
assert.equal(api.sim.grabs.size, 0); assert.equal(canvas.capturedPointers.size, 0);
assert.equal(element('grabFeedback').hidden, true, 'Focus interruption must hide both graphical grabs.');
api.sim.reset(); api.skin.update();
pass('a delayed second touch binds the first hand-deformed mesh and blur clears both graphical grabs');

// Rotation changes the CSS rectangle before the next draw resizes the backing
// buffer. Pickup must still match the displayed stage in that event window.
const synchronizedBacking = [canvas.width, canvas.height];
canvas.width = 1400; canvas.height = 900;
camera.update(phoneRect.width / phoneRect.height);
const resizedHead = touchPacket(phoneProject([1.25, 3.02, .45]), 406, true), resizedHit = rawPhonePick(resizedHead);
assert.ok(resizedHit, 'The rotated CSS-stage fixture must visibly hit the head.');
canvas.events.pointerdown(resizedHead);
assert.ok(api.sim.grabs.has(406));
assert.deepEqual(api.sim.grabs.get(406).rest, resizedHit.rest, 'Pickup during a stale backing-buffer resize must bind the actual CSS-stage ray hit.');
assert.equal(camera.aspect, phoneRect.width / phoneRect.height);
console.log('Phone resize contact fixture:', JSON.stringify({ stage: phoneRect, staleBacking: [canvas.width, canvas.height],
  fingerCenter: { clientX: resizedHead.clientX, clientY: resizedHead.clientY }, materialRest: resizedHit.rest, cameraAspect: camera.aspect }));
canvas.events.pointercancel({ pointerId: 406 });
[canvas.width, canvas.height] = synchronizedBacking;
pass('rotation before backing-buffer resize preserves the displayed-stage local touch binding');

// Integrate the actual pointer handlers with the final camera-space arena.
// Compare mapped material points, not just requested drag targets or Map size.
const savedPhysics = [api.sim.firm, api.sim.damping];
api.sim.firm = .55; api.sim.damping = .35; api.sim.setArena(camera.arena());
const oppositeLeft = touchPacket(phoneProject([-.6, 1.8, .5]), 411, true);
const oppositeRight = touchPacket(phoneProject([.5, 1.8, .5]), 412, false);
canvas.events.pointerdown(oppositeLeft); canvas.events.pointerdown(oppositeRight);
assert.equal(api.sim.grabs.size, 2, 'The integrated phone fixture must hit two distinct body locations.');
const heldBindings = [api.sim.grabs.get(411).bind, api.sim.grabs.get(412).bind];
assert.notDeepEqual(heldBindings[0].ids, heldBindings[1].ids);
const separation = () => Math.hypot(...api.sim.map(heldBindings[0]).map((value, axis) => value - api.sim.map(heldBindings[1])[axis]));
const initialSeparation = separation(), integratedCamera = [camera.yaw, camera.pitch, camera.distance, ...camera.target];
let sampledStates = 0, maxHeldStrain = 0, volumeRange = [Infinity, -Infinity];
const checkIntegratedState = () => {
  const metrics = api.sim.metrics(); sampledStates++;
  assert.ok(metrics.finite && api.sim.v.every(Number.isFinite));
  assert.ok(metrics.maxStrain < 2.5 && metrics.minFloorClearance >= -.0001);
  assert.ok(metrics.volumeRatio > .9 && metrics.volumeRatio < 1.1);
  maxHeldStrain = Math.max(maxHeldStrain, metrics.maxStrain);
  volumeRange[0] = Math.min(volumeRange[0], metrics.volumeRatio); volumeRange[1] = Math.max(volumeRange[1], metrics.volumeRatio);
};
for (let step = 0; step < 90; step++) {
  if (step < 30) {
    const distance = (step + 1) * 55 / 30;
    canvas.events.pointermove({ ...oppositeLeft, button: -1, clientX: oppositeLeft.clientX - distance });
    canvas.events.pointermove({ ...oppositeRight, button: -1, clientX: oppositeRight.clientX + distance });
  }
  api.sim.step(1 / 90); if (step % 15 === 14) checkIntegratedState();
}
const heldSeparation = separation();
assert.ok(heldSeparation - initialSeparation > .25 && heldSeparation / initialSeparation > 1.2,
  'Opposing touch events must increase the actual local material separation with the arena active.');
assert.deepEqual([camera.yaw, camera.pitch, camera.distance, ...camera.target], integratedCamera, 'Touch stretching must keep the camera and floor projection fixed.');
canvas.events.pointerup({ pointerId: 411 }); canvas.events.pointerup({ pointerId: 412 });
assert.equal(api.sim.grabs.size, 0); assert.equal(canvas.capturedPointers.size, 0); assert.equal(element('grabFeedback').hidden, true);
for (let step = 0; step < 360; step++) { api.sim.step(1 / 90); if (step % 15 === 14) checkIntegratedState(); }
api.skin.update();
assert.ok(api.skin.data.every(Number.isFinite));
let minSurfaceY = Infinity;
for (let i = 1; i < api.skin.positions.length; i += 3) minSurfaceY = Math.min(minSurfaceY, api.skin.positions[i]);
assert.ok(minSurfaceY >= .0119, 'Released touch stretch must keep the actual skin above the fixed floor.');
assert.ok(api.sim.metrics().energy < .15, 'Released touch stretch must settle with the final arena active.');
console.log('Phone dual-touch arena:', JSON.stringify({ steps: 450, sampledStates, initialSeparation, heldSeparation,
  gain: heldSeparation - initialSeparation, ratio: heldSeparation / initialSeparation, camera: integratedCamera,
  maxStrain: maxHeldStrain, volumeRange, minSurfaceY, releaseEnergy: api.sim.metrics().energy }));
[api.sim.firm, api.sim.damping] = savedPhysics; api.sim.reset(); api.skin.update();
pass('opposing phone touch handlers stretch actual bindings within the arena, preserve the camera and recover after release');

canvas.getBoundingClientRect = oldRect; [canvas.width, canvas.height] = oldCanvasSize; global.matchMedia = oldMedia;

element('view').onclick();
camera.update(1400 / 900);
hit = project([-0.25, 1.65, 0.6]);
canvas.events.pointerdown({ ...hit, pointerId: 105 });
assert.ok(api.sim.grab);
element('tuningToggle').onclick();
assert.equal(api.getTuning(), true);
assert.equal(api.sim.grab, null);
assert.equal(canvas.hasPointerCapture(105), false, 'Opening settings must actively release the grab capture.');
assert.equal(element('tuningPanel').hidden, false);
assert.equal(element('tuningBackdrop').hidden, false);
assert.equal(element('tuningToggle').attrs['aria-expanded'], 'true');
assert.equal(document.activeElement, element('tuningClose'));
canvas.events.pointerdown({ ...hit, pointerId: 106 });
assert.equal(api.sim.grab, null, 'An open dialog must block canvas grabbing.');
assert.equal(canvas.hasPointerCapture(106), false, 'The blocked pointer must not become captured.');
const dialogZoom = camera.distance;
canvas.events.wheel({ deltaY: -300 });
assert.equal(camera.distance, dialogZoom, 'An open dialog must also block underlying wheel zoom.');
canvas.events.pointermove({ ...hit, pointerId: 105, clientX: hit.clientX + 150 });
assert.equal(api.sim.grab, null);
const dialogState = [api.sim.p.slice(), api.sim.v.slice(), camera.yaw, camera.pitch, camera.distance, api.renderer.palette, api.sim.firm, api.sim.damping];
for (const key of [' ', 'n', 'r', 'ArrowRight', '+']) {
  element(key === ' ' ? 'slow' : 'firmness').focus();
  const event = window.events.keydown({ key, code: key === ' ' ? 'Space' : key });
  assert.deepEqual([api.sim.p, api.sim.v, camera.yaw, camera.pitch, camera.distance, api.renderer.palette, api.sim.firm, api.sim.damping], dialogState);
  assert.equal(api.sim.paused, false);
  assert.notEqual(event.defaultPrevented, true, 'Dialog controls must retain their native slider and checkbox key behavior.');
}
element('tuningClose').focus();
api.setLanguage('en');
assert.equal(element('tuningTitle').textContent, 'More');
assert.equal(api.getTuning(), true);
assert.equal(element('tuningPanel').hidden, false);
assert.equal(document.activeElement, element('tuningClose'), 'Language rendering must preserve the dialog focus.');
assert.deepEqual([api.sim.p, api.sim.v, camera.yaw, camera.pitch, camera.distance, api.renderer.palette, api.sim.firm, api.sim.damping], dialogState);
api.setLanguage('zh-CN');
assert.equal(element('tuningTitle').textContent, '更多玩法');
const panelFocusOrder = domNodes.filter(node => {
  if (!['INPUT', 'BUTTON'].includes(node.tagName)) return false;
  for (let parent = node.parentElement; parent; parent = parent.parentElement) if (parent === element('tuningPanel')) return true;
  return false;
}).map(node => node.id);
assert.deepEqual(panelFocusOrder, ['tuningClose', 'firmness', 'damping', 'slow', 'mesh', 'view'], 'Tab boundaries must match the actual dialog controls.');
const backwardTab = window.events.keydown({ key: 'Tab', code: 'Tab', shiftKey: true });
assert.equal(backwardTab.defaultPrevented, true);
assert.equal(document.activeElement, element('view'));
const forwardTab = window.events.keydown({ key: 'Tab', code: 'Tab', shiftKey: false });
assert.equal(forwardTab.defaultPrevented, true);
assert.equal(document.activeElement, element('tuningClose'));
element('firmness').focus();
const innerTab = window.events.keydown({ key: 'Tab', code: 'Tab', shiftKey: false });
assert.notEqual(innerTab.defaultPrevented, true, 'Interior controls must retain browser-native Tab behavior.');
element('languageEn').focus();
window.events.keydown({ key: 'Tab', code: 'Tab', shiftKey: false });
assert.equal(document.activeElement, element('tuningClose'), 'Tab from outside the dialog must return inside it.');
document.documentElement.classList.add('immersive');
api.setLanguage('zh-CN');
window.events.keydown({ key: 'Escape', code: 'Escape' });
assert.equal(api.getTuning(), false);
assert.equal(element('tuningPanel').hidden, true);
assert.equal(element('tuningBackdrop').hidden, true);
assert.equal(element('tuningToggle').attrs['aria-expanded'], 'false');
assert.equal(document.activeElement, element('tuningToggle'));
assert.equal(document.documentElement.classList.contains('immersive'), true, 'The first Escape must close the dialog while retaining immersive view.');
window.events.keydown({ key: 'Escape', code: 'Escape' });
assert.equal(document.documentElement.classList.contains('immersive'), false, 'The next Escape may leave immersive view.');
element('firmness').focus();
assert.equal(document.activeElement, element('tuningToggle'), 'A hidden dialog control must not accept focus.');
for (const closeId of ['tuningClose', 'tuningBackdrop', 'view']) {
  element('tuningToggle').onclick();
  element(closeId).onclick();
  assert.equal(api.getTuning(), false);
  assert.equal(document.activeElement, element('tuningToggle'));
}
pass('settings clear capture, block grabbing, retain bilingual state, trap Tab and restore focus on every close path');

camera.update(1400 / 900);
hit = project([-0.25, 1.65, 0.6]);
camera.distance = 10;
const touch = (pointerId, offset) => ({ clientX: 20 + offset, clientY: 400, pointerId, pointerType: 'touch', button: 0 });
assert.equal(api.skin.pick(camera.eye, camera.ray(20, 400, canvas.getBoundingClientRect())), null, 'Pinch fixtures must begin on real blank space.');
canvas.events.pointerdown(touch(201, 0));
canvas.events.pointerdown(touch(202, 100));
canvas.events.pointermove(touch(202, 110));
const zoomAfterFirstMove = camera.distance;
assert.ok(zoomAfterFirstMove < 10 && zoomAfterFirstMove > 6.4);
canvas.events.pointerdown(touch(203, 300));
assert.equal(camera.distance, zoomAfterFirstMove, 'Adding a third finger must not jump the view.');
canvas.events.pointermove(touch(203, 320));
assert.equal(camera.distance, zoomAfterFirstMove, 'A third finger outside the active pair must not change zoom.');
canvas.events.pointermove(touch(202, 120));
assert.ok(camera.distance < zoomAfterFirstMove, 'The original pair must keep zooming with a third finger present.');
const zoomBeforeThirdLeaves = camera.distance;
canvas.events.pointerup(touch(203, 320));
assert.equal(camera.distance, zoomBeforeThirdLeaves);
canvas.events.pointermove(touch(202, 125));
assert.ok(camera.distance < zoomBeforeThirdLeaves, 'The original pair must keep zooming after the third finger leaves.');
canvas.events.pointerdown(touch(203, 300));
const zoomBeforePairChanges = camera.distance;
canvas.events.pointerup(touch(201, 0));
assert.equal(camera.distance, zoomBeforePairChanges, 'Changing the active pair must establish a new distance baseline.');
canvas.events.pointermove(touch(203, 310));
assert.ok(camera.distance < zoomBeforePairChanges, 'The two remaining fingers must continue zooming.');
canvas.events.pointerup(touch(202, 125));
const oneFingerCamera = [camera.yaw, camera.pitch, camera.distance];
canvas.events.pointermove(touch(203, 900));
assert.equal(api.sim.grab, null, 'The last remaining finger must not become a fresh object grab.');
assert.deepEqual([camera.yaw, camera.pitch, camera.distance], oneFingerCamera, 'The last finger must not unexpectedly orbit or zoom.');
canvas.events.pointerup(touch(203, 900));
pass('three-pointer pinch retains zoom through finger addition, removal and pair changes without one-finger grabbing');

camera.distance = 10;
canvas.events.pointerdown(touch(301, 0));
canvas.events.pointerdown(touch(302, 0));
for (const offset of [0, 5, 10]) {
  canvas.events.pointermove(touch(302, offset));
  assert.equal(camera.distance, 10, 'Coincident or nearly coincident fingers must not jump the camera.');
}
canvas.events.pointermove(touch(302, 11));
assert.ok(Number.isFinite(camera.distance) && Math.abs(camera.distance - 100 / 11) < 1e-9);
canvas.events.pointermove(touch(302, 0));
assert.ok(Number.isFinite(camera.distance) && Math.abs(camera.distance - 10) < 1e-9);
canvas.events.pointercancel(touch(302, 0));
canvas.events.pointerup(touch(301, 0));
pass('zero-distance pinch stays finite and starts or returns without a zoom jump');

camera.distance = 10;
const beforeTouchOrbit = [camera.yaw, camera.pitch, camera.distance];
canvas.events.pointerdown(touch(311, 0));
canvas.events.pointerdown(touch(312, 100));
canvas.events.pointermove({ ...touch(311, 0), clientY: 420 });
canvas.events.pointermove({ ...touch(312, 100), clientY: 420 });
assert.equal(api.sim.grabs.size, 0, 'Blank camera gestures must never acquire deformation constraints.');
assert.ok(camera.pitch > beforeTouchOrbit[1], 'Moving the two blank touches together must preserve touch orbit access.');
assert.ok(Math.abs(camera.distance - beforeTouchOrbit[2]) < 1e-9, 'Parallel blank touches must return to the same zoom.');
canvas.events.pointerup({ pointerId: 311 }); canvas.events.pointerup({ pointerId: 312 });
pass('two blank touches can gently orbit by their midpoint while retaining pinch zoom');

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

const originalSkinUpdate = api.skin.update, originalDraw = api.renderer.draw;
let skinUpdates = 0, draws = 0;
api.skin.update = function () { skinUpdates++; return originalSkinUpdate.call(this); };
api.renderer.draw = () => { draws++; };
api.sim.paused = false;
element('slow').onchange({ target: { checked: false } });
api.resetTiming();
api.frame(0); api.frame(1);
assert.equal(skinUpdates, 0, 'Frames with no physics step must reuse the current skin.');
assert.equal(draws, 2, 'Visible zero-step frames must still render camera and UI-driven changes.');
api.frame(20);
assert.equal(skinUpdates, 1, 'A frame that advances physics must refresh the skin exactly once.');
const positionsBeforeHidden = api.sim.p.slice(), velocitiesBeforeHidden = api.sim.v.slice();
document.hidden = true;
api.frame(1020); api.frame(2020);
assert.equal(draws, 3, 'Hidden frames must not submit rendering work.');
assert.equal(skinUpdates, 1, 'Hidden frames must not reskin.');
assert.deepEqual(api.sim.p, positionsBeforeHidden);
assert.deepEqual(api.sim.v, velocitiesBeforeHidden);
document.hidden = false;
api.frame(2021);
assert.equal(draws, 4);
assert.equal(skinUpdates, 1, 'Returning from hidden state must not replay the time spent hidden.');
api.sim.paused = true;
api.frame(2040);
assert.equal(draws, 5, 'Paused frames must still render view changes.');
assert.equal(skinUpdates, 1, 'Paused physics must not reskin unchanged geometry.');
api.sim.paused = false;
api.skin.update = originalSkinUpdate; api.renderer.draw = originalDraw;
pass('hidden frames skip drawing and physics, and zero-step or paused frames reuse the skin');

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
assert.equal(toolState.renderer, 'webgpu', 'Read-only state must identify the actual rendering backend.');
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
assert.equal(element('statusText').textContent, '3D图形暂不可用');
assert.ok(api.sim.grab === null, 'Rendering failure must cancel the active grab.');
assert.equal(canvas.classList.contains('grabbing'), false);
assert.equal(canvas.hasPointerCapture(98), false);
pass('render interruption shows fallback and releases the active grab and capture');
const failedPositions = api.sim.p.slice(), failedVelocities = api.sim.v.slice(), failedPaused = api.sim.paused;
const failedCamera = [camera.yaw, camera.pitch, camera.distance, ...camera.target];
for (const [key, code] of [[' ', 'Space'], ['n', 'KeyN'], ['r', 'KeyR'],
  ['ArrowLeft', 'ArrowLeft'], ['ArrowRight', 'ArrowRight'], ['ArrowUp', 'ArrowUp'], ['ArrowDown', 'ArrowDown'], ['+', 'Equal'], ['-', 'Minus']]) {
  window.events.keydown({ key, code, preventDefault() {} });
  assert.equal(api.sim.paused, failedPaused, `Unavailable ${code} must preserve pause state.`);
  assert.deepEqual(api.sim.p, failedPositions, `Unavailable ${code} must preserve the shape.`);
  assert.deepEqual(api.sim.v, failedVelocities, `Unavailable ${code} must preserve velocities.`);
  assert.deepEqual([camera.yaw, camera.pitch, camera.distance, ...camera.target], failedCamera, `Unavailable ${code} must preserve the camera.`);
}
pass('unavailable rendering disables physics and camera keyboard shortcuts');
canvas.events.wheel({ deltaY: -300 });
assert.deepEqual([camera.yaw, camera.pitch, camera.distance, ...camera.target], failedCamera, 'Unavailable rendering must also disable canvas wheel zoom.');
pass('unavailable rendering disables canvas wheel zoom');
const unavailableToolState = tools.get('read_jelly_state').execute();
assert.equal(unavailableToolState.ready, false, 'Read-only tools must still report unavailability.');
assert.throws(() => configure.execute({ material: 'Grape', firmness: 0, internalDamping: 0, quarterSpeed: true, showMesh: true }));
for (const action of ['nudge', 'reset', 'pause', 'resume', 'reset_view']) {
  assert.throws(() => control.execute({ action }), `Unavailable tool action ${action} must reject mutation.`);
  assert.deepEqual(tools.get('read_jelly_state').execute(), unavailableToolState);
  assert.deepEqual(api.sim.p, failedPositions);
  assert.deepEqual(api.sim.v, failedVelocities);
  assert.deepEqual([camera.yaw, camera.pitch, camera.distance, ...camera.target], failedCamera);
}
pass('unavailable rendering rejects mutating tools while preserving readable state');
element('languageEn').onclick();
assert.equal(element('statusText').textContent, '3D GRAPHICS UNAVAILABLE');
assert.match(element('fallbackReason').textContent, /Reload to restore/);
assert.equal(element('fallbackTitle').textContent, '3D graphics are unavailable.');
api.fail('GPU validation detail', 'renderFailed');
element('languageZh').onclick();
assert.equal(element('fallbackTitle').textContent, '3D图形暂不可用');
assert.match(element('fallbackReason').textContent, /渲染失败/);
assert.match(element('fallbackReason').textContent, /GPU validation detail/);
assert.equal(element('controls').disabled, true);
pass('language switching translates unavailable status and fallback while retaining GPU diagnostics');
console.log(`PASS: ${passed} Node/DOM-harness checks. No browser, real touch, CSS layout, WGSL compilation, or GPU rendering was exercised.`);
