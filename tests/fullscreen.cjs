'use strict';

// Execute only the actual fullscreen helpers. No DOM layout, browser, GPU,
// fullscreen permission, or mobile operating-system UI is exercised here.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');
const script = html.match(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/i)[1];
const start = script.indexOf('function renderFullscreen(');
assert.ok(start >= 0, 'The application must provide fullscreen helpers.');
const end = script.indexOf('const add=', start);
assert.ok(end > start, 'Fullscreen helpers must stay before the geometry helpers.');
const source = script.slice(start, end);

function surface() {
  const elements = new Map(['fullscreen', 'fullscreenLabel'].map(id => [id, {
    id, textContent: '', attrs: {}, setAttribute(name, value) { this.attrs[name] = value; },
  }]));
  const classes = new Set(), events = new Map(), windowEvents = new Map();
  const root = { classList: { add: name => classes.add(name), remove: name => classes.delete(name), contains: name => classes.has(name) } };
  const document = { documentElement: root, fullscreenElement: null, webkitFullscreenElement: null,
    addEventListener(name, callback) { if (!events.has(name)) events.set(name, []); events.get(name).push(callback); } };
  const window = { addEventListener(name, callback) { if (!windowEvents.has(name)) windowEvents.set(name, []); windowEvents.get(name).push(callback); } };
  const copy = {
    'zh-CN': { fullscreen: '全屏玩', exitFullscreen: '退出全屏' },
    en: { fullscreen: 'Full screen', exitFullscreen: 'Exit full screen' },
  };
  let language = 'zh-CN', cancellations = 0;
  const notices = [], warnings = [];
  const api = new Function('document', 'window', '$', 't', 'notice', 'cancelInteraction', 'console',
    'let tuningOpen=false;' + source + ';return {renderFullscreen,toggleFullscreen,initializeFullscreen,setTuningOpen:open=>tuningOpen=Boolean(open)};')(
      document, window, id => { assert.ok(elements.has(id), `Unexpected element: ${id}`); return elements.get(id); },
      key => { assert.ok(key in copy[language], `Unexpected fullscreen label key: ${key}`); return copy[language][key]; },
      key => notices.push(key), () => { cancellations++; }, { warn: (...args) => warnings.push(args) });
  api.initializeFullscreen();
  return { ...api, document, root, button: elements.get('fullscreen'), label: elements.get('fullscreenLabel'), notices, warnings,
    cancellations: () => cancellations, language(next) { language = next; api.renderFullscreen(); },
    emit(name) { for (const callback of events.get(name) || []) callback(); },
    escape() { const event = { key: 'Escape', prevented: false, preventDefault() { this.prevented = true; } }; for (const callback of windowEvents.get('keydown') || []) callback(event); return event; },
    listenerCount(name) { return (events.get(name) || windowEvents.get(name) || []).length; } };
}

let passed = 0;
function pass(name) { passed++; console.log(`PASS ${name}`); }
async function main() {
  const standard = surface();
  standard.document.fullscreenEnabled = true;
  let requested = 0, exited = 0;
  standard.root.requestFullscreen = async function () { assert.equal(this, standard.root); requested++; standard.document.fullscreenElement = this; standard.emit('fullscreenchange'); };
  standard.document.exitFullscreen = async function () { assert.equal(this, standard.document); exited++; standard.document.fullscreenElement = null; standard.emit('fullscreenchange'); };
  await standard.button.onclick();
  assert.equal(requested, 1);
  assert.equal(standard.button.attrs['aria-pressed'], 'true');
  assert.equal(standard.label.textContent, '退出全屏');
  assert.equal(standard.button.attrs['data-mode'], 'native');
  assert.equal(standard.button.attrs['aria-busy'], 'false');
  assert.equal(standard.root.classList.contains('immersive'), false);
  assert.ok(standard.notices.includes('fullscreenHint'));
  await standard.button.onclick();
  assert.equal(exited, 1);
  assert.equal(standard.button.attrs['aria-pressed'], 'false');
  assert.equal(standard.label.textContent, '全屏玩');
  assert.equal(standard.button.attrs['data-mode'], 'windowed');
  assert.ok(standard.cancellations() >= 2);
  pass('standard fullscreen entry and exit follow the actual element and cancel grabs');

  const eventBeforePromise = surface();
  eventBeforePromise.document.fullscreenEnabled = true;
  let finishNativeRequest, eventDrivenExits = 0;
  eventBeforePromise.root.requestFullscreen = function () {
    eventBeforePromise.document.fullscreenElement = this;
    eventBeforePromise.emit('fullscreenchange');
    return new Promise(resolve => { finishNativeRequest = resolve; });
  };
  eventBeforePromise.document.exitFullscreen = function () {
    eventDrivenExits++;
    eventBeforePromise.document.fullscreenElement = null;
    eventBeforePromise.emit('fullscreenchange');
    return Promise.resolve();
  };
  const nativeRequest = eventBeforePromise.toggleFullscreen();
  assert.equal(eventBeforePromise.button.attrs['aria-pressed'], 'true');
  assert.equal(eventBeforePromise.button.attrs['aria-busy'], 'false', 'The native state event must clear the pending operation indicator.');
  await eventBeforePromise.toggleFullscreen();
  assert.equal(eventDrivenExits, 1, 'A native state event must unlock exit even if its request Promise is still pending.');
  assert.equal(eventBeforePromise.document.fullscreenElement, null);
  assert.equal(eventBeforePromise.button.attrs['aria-pressed'], 'false');
  finishNativeRequest();
  await nativeRequest;
  assert.equal(eventBeforePromise.root.classList.contains('immersive'), false, 'A late entry Promise must not re-enter immersive mode after the user exits.');
  pass('native state events unlock exit before the entry Promise settles and ignore its stale completion');

  const overlapping = surface();
  let finishEntry, finishExit, overlappingExits = 0;
  overlapping.root.requestFullscreen = function () {
    overlapping.document.fullscreenElement = this;
    overlapping.emit('fullscreenchange');
    return new Promise(resolve => { finishEntry = resolve; });
  };
  overlapping.document.exitFullscreen = () => {
    overlappingExits++;
    return new Promise(resolve => { finishExit = resolve; });
  };
  const enteringThen = overlapping.toggleFullscreen(), exitingNow = overlapping.toggleFullscreen();
  assert.equal(overlapping.button.attrs['aria-busy'], 'true');
  finishEntry();
  await enteringThen;
  assert.equal(overlapping.button.attrs['aria-busy'], 'true', 'A stale entry completion must not clear the newer exit operation.');
  await overlapping.toggleFullscreen();
  assert.equal(overlappingExits, 1, 'The newer exit must still suppress duplicate requests.');
  overlapping.document.fullscreenElement = null;
  overlapping.emit('fullscreenchange');
  finishExit();
  await exitingNow;
  assert.equal(overlapping.button.attrs['data-mode'], 'windowed');
  assert.equal(overlapping.button.attrs['aria-busy'], 'false');
  assert.equal(overlapping.root.classList.contains('immersive'), false);
  pass('a stale entry completion cannot unlock or override a newer pending exit');

  const rejected = surface();
  rejected.root.requestFullscreen = () => Promise.reject(Error('Expected permission denial'));
  await rejected.toggleFullscreen();
  assert.equal(rejected.document.fullscreenElement, null);
  assert.equal(rejected.root.classList.contains('immersive'), true);
  assert.deepEqual(rejected.notices, ['immersiveHint']);
  assert.equal(rejected.warnings.length, 1, 'Preserve a diagnostic for a rejected native request.');
  assert.equal(rejected.button.attrs['aria-pressed'], 'true');
  assert.equal(rejected.button.attrs['data-mode'], 'immersive');
  await rejected.toggleFullscreen();
  assert.equal(rejected.root.classList.contains('immersive'), false);
  assert.equal(rejected.button.attrs['aria-pressed'], 'false');
  pass('a rejected native request uses an honestly announced, reversible immersive view');

  const unavailable = surface();
  unavailable.initializeFullscreen();
  assert.equal(unavailable.listenerCount('keydown'), 1, 'Initialization must not duplicate Escape listeners.');
  await unavailable.toggleFullscreen();
  assert.equal(unavailable.root.classList.contains('immersive'), true);
  assert.deepEqual(unavailable.notices, ['immersiveHint']);
  assert.equal(unavailable.escape().prevented, true);
  assert.equal(unavailable.root.classList.contains('immersive'), false);
  assert.equal(unavailable.label.textContent, '全屏玩');
  assert.equal(unavailable.button.attrs['aria-pressed'], 'false');
  pass('unavailable native fullscreen remains usable before GPU readiness and exits with Escape');

  const modal = surface();
  await modal.toggleFullscreen();
  modal.setTuningOpen(true);
  const cancellationsBeforeModalEscape = modal.cancellations();
  assert.equal(modal.escape().prevented, false, 'The fullscreen listener must leave modal Escape to the dialog handler.');
  assert.equal(modal.root.classList.contains('immersive'), true);
  assert.equal(modal.cancellations(), cancellationsBeforeModalEscape);
  modal.setTuningOpen(false);
  assert.equal(modal.escape().prevented, true);
  assert.equal(modal.button.attrs['data-mode'], 'windowed');
  pass('modal Escape takes precedence over leaving immersive view');

  const disabled = surface();
  disabled.document.fullscreenEnabled = false;
  disabled.root.requestFullscreen = () => { throw Error('A known disabled native API must not be called.'); };
  await disabled.toggleFullscreen();
  assert.equal(disabled.root.classList.contains('immersive'), true);
  assert.equal(disabled.warnings.length, 0);
  pass('a disabled fullscreen capability falls back without requesting permission');

  const pending = surface();
  let finish, calls = 0;
  pending.root.requestFullscreen = () => { calls++; return new Promise(resolve => { finish = resolve; }); };
  const entering = pending.toggleFullscreen();
  await pending.toggleFullscreen();
  assert.equal(calls, 1);
  assert.equal(pending.button.attrs['aria-pressed'], 'false', 'A pending request must not claim actual fullscreen.');
  assert.equal(pending.button.attrs['data-mode'], 'windowed');
  assert.equal(pending.button.attrs['aria-busy'], 'true');
  finish();
  await entering;
  assert.equal(pending.root.classList.contains('immersive'), true, 'A resolved request without a fullscreen element is still not native success.');
  assert.deepEqual(pending.notices, ['immersiveHint']);
  assert.equal(pending.button.attrs['aria-busy'], 'false');
  pass('pending or ineffective requests cannot optimistically claim native fullscreen');

  const external = surface();
  external.document.fullscreenElement = external.root;
  external.emit('fullscreenchange');
  assert.equal(external.label.textContent, '退出全屏');
  external.document.exitFullscreen = () => Promise.reject(Error('Expected exit rejection'));
  await external.toggleFullscreen();
  assert.equal(external.button.attrs['aria-pressed'], 'true', 'A rejected exit must not claim that native fullscreen ended.');
  external.document.fullscreenElement = null; // The browser's Escape action.
  external.emit('fullscreenchange');
  assert.equal(external.label.textContent, '全屏玩');
  assert.equal(external.button.attrs['aria-pressed'], 'false');
  pass('external fullscreen changes and rejected exits keep labels synchronized with reality');

  const webkit = surface();
  webkit.document.webkitFullscreenEnabled = true;
  webkit.root.webkitRequestFullscreen = function () { webkit.document.webkitFullscreenElement = this; webkit.emit('webkitfullscreenchange'); };
  webkit.document.webkitExitFullscreen = function () { webkit.document.webkitFullscreenElement = null; webkit.emit('webkitfullscreenchange'); };
  await webkit.toggleFullscreen();
  assert.equal(webkit.root.classList.contains('immersive'), false);
  assert.equal(webkit.label.textContent, '退出全屏');
  await webkit.toggleFullscreen();
  assert.equal(webkit.label.textContent, '全屏玩');
  pass('WebKit-prefixed entry, change notification and exit are detected');

  const bilingual = surface();
  await bilingual.toggleFullscreen();
  const beforeLanguage = bilingual.cancellations();
  bilingual.language('en');
  assert.equal(bilingual.label.textContent, 'Exit full screen');
  assert.equal(bilingual.button.attrs['aria-label'], 'Exit full screen');
  assert.equal(bilingual.root.classList.contains('immersive'), true);
  assert.equal(bilingual.cancellations(), beforeLanguage);
  await bilingual.toggleFullscreen();
  assert.equal(bilingual.label.textContent, 'Full screen');
  bilingual.language('zh-CN');
  assert.equal(bilingual.label.textContent, '全屏玩');
  pass('language refresh translates fullscreen state without changing mode or grab state');

  console.log(`PASS: ${passed} Node fullscreen-handler checks. No actual browser or native fullscreen UI was exercised.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
