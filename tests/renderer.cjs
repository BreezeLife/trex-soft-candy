'use strict';

// Test actual startup selection against renderer stand-ins. These checks do
// not compile GLSL/WGSL, create a graphics context, or verify Android hardware.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');
const script = html.match(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/i)[1];
const start = script.indexOf('function rendererPreference(');
assert.ok(start >= 0, 'The application must provide testable renderer selection.');
const end = script.indexOf('let sim,skin,renderer,camera', start);
assert.ok(end > start);
assert.match(script.slice(script.indexOf('async function main()')), /await initializeJellyRenderer\(\$\('stage'\),skin,camera,rendererPreference\(location\.search\)\)/);

function setup(options = {}) {
  const calls = [], skin = { simulation: 'same soft body' }, camera = { pose: 'same camera' }, host = {};
  function canvas(name) {
    return { name, selectedContext: null, attrs: { id: 'stage', tabindex: '0', 'data-i18n-aria': 'canvasAria' },
      setAttribute(key, value) { this.attrs[key] = String(value); },
      cloneNode(deep) { assert.equal(deep, false); const copy = canvas(name + '-replacement'); copy.attrs = { ...this.attrs }; calls.push('clone'); return copy; },
      replaceWith(copy) { assert.equal(host.current, this); host.current = copy; calls.push('replace'); },
    };
  }
  host.current = canvas('stage');
  class GPU {
    constructor() { this.backend = 'webgpu'; this.device = { destroy() { calls.push('destroy-gpu'); } }; }
    async init(target, suppliedSkin, suppliedCamera) {
      calls.push('webgpu'); assert.equal(suppliedSkin, skin); assert.equal(suppliedCamera, camera);
      this.canvas = target; target.selectedContext = 'webgpu';
      if (options.gpuFailure) throw Error('Expected WebGPU startup failure');
    }
  }
  class GL {
    constructor() { this.backend = 'webgl2'; }
    async init(target, suppliedSkin, suppliedCamera) {
      calls.push('webgl2'); assert.equal(suppliedSkin, skin); assert.equal(suppliedCamera, camera);
      assert.equal(target.selectedContext, null, 'WebGL2 must receive a canvas that was not locked to WebGPU.');
      this.canvas = target; target.selectedContext = 'webgl2';
      if (options.glFailure) throw Error('Expected WebGL2 startup failure');
    }
  }
  const api = new Function('Renderer', 'WebGLRenderer', 'URLSearchParams', script.slice(start, end) + ';return {rendererPreference,initializeJellyRenderer};')(GPU, GL, URLSearchParams);
  return { ...api, calls, skin, camera, host };
}

// Exercise the real resource-owning class with allocation-tracking GL API
// stand-ins. A successful compile result here is not GLSL compilation evidence.
const glStart = script.indexOf('class WebGLRenderer{');
assert.ok(glStart >= 0 && glStart < start);
const WebGLRenderer = new Function('GL_VERTEX', 'GL_FRAGMENT', 'GL_BODY', 'GL_QUAD_VERTEX', 'GL_FLOOR', 'devicePixelRatio', 'matchMedia', script.slice(glStart, start) + ';return WebGLRenderer;')('vertex', 'fragment', 'body', 'quad', 'floor', 1, () => ({ matches: false }));
function resourceSetup(options = {}) {
  const kinds = ['Shader', 'Program', 'Buffer', 'VertexArray', 'Texture', 'Framebuffer', 'Renderbuffer'];
  const live = new Map(kinds.map(kind => [kind, new Set()]));
  let nextId = 0, framebufferChecks = 0, vertexAttributes = 0;
  const gl = { VERTEX_SHADER: 'vertex', FRAGMENT_SHADER: 'fragment', COMPILE_STATUS: 'compile', LINK_STATUS: 'link', NO_ERROR: 0, FRAMEBUFFER_COMPLETE: 'complete' };
  for (const kind of kinds) {
    gl['create' + kind] = () => { const resource = { kind, id: ++nextId }; live.get(kind).add(resource); return resource; };
    gl['delete' + kind] = resource => {
      if (resource == null) return;
      assert.equal(resource.kind, kind);
      assert.ok(live.get(kind).delete(resource), kind + ' must be released exactly once.');
    };
  }
  gl.shaderSource = (shader, source) => { shader.source = source; };
  gl.compileShader = () => {};
  gl.getShaderParameter = shader => !(options.fragmentFailure && shader.source === 'bad fragment');
  gl.getShaderInfoLog = () => 'expected fragment failure';
  gl.getProgramParameter = () => !options.linkFailure;
  gl.getProgramInfoLog = () => 'expected link failure';
  gl.getUniformLocation = () => null;
  gl.checkFramebufferStatus = () => ++framebufferChecks === options.incompleteFramebufferAt ? 'incomplete' : gl.FRAMEBUFFER_COMPLETE;
  gl.getError = () => options.resourceFailure ? 1 : gl.NO_ERROR;
  gl.vertexAttribPointer = () => { if (++vertexAttributes === options.vertexAttributeFailureAt) throw Error('expected vertex attribute failure'); };
  for (const name of ['attachShader', 'linkProgram', 'bindBuffer', 'bufferData', 'bindVertexArray', 'enableVertexAttribArray', 'bindRenderbuffer', 'renderbufferStorage', 'bindTexture', 'texParameteri', 'texImage2D', 'bindFramebuffer', 'framebufferTexture2D', 'framebufferRenderbuffer']) gl[name] = () => {};
  const canvas = { width: 0, height: 0, getContext: () => gl, getBoundingClientRect: () => ({ width: 640, height: 480 }), addEventListener() {} };
  const skin = { data: new Float32Array(40), indices: new Uint32Array(3), lines: new Uint32Array(2) };
  const renderer = new WebGLRenderer(); renderer.gl = gl;
  const counts = () => Object.fromEntries([...live].map(([kind, resources]) => [kind, resources.size]));
  const assertEmpty = () => assert.deepEqual(counts(), Object.fromEntries(kinds.map(kind => [kind, 0])), 'Failed or disposed GL initialization must leave no owned resources.');
  return { renderer, canvas, skin, counts, assertEmpty };
}
let passed = 0;
function pass(name) { passed++; console.log('PASS ' + name); }
async function main() {
  const normal = setup();
  for (const search of ['', '?renderer=invalid', '?renderer=webgpu']) assert.equal(normal.rendererPreference(search), 'webgpu');
  assert.equal(normal.rendererPreference('?renderer=webgl2'), 'webgl2');
  pass('the query selects explicit WebGL2 while defaults and invalid values retain WebGPU preference');

  const original = normal.host.current;
  const preferred = await normal.initializeJellyRenderer(original, normal.skin, normal.camera);
  assert.equal(preferred.backend, 'webgpu');
  assert.equal(normal.host.current, original);
  assert.equal(original.attrs['data-renderer'], 'webgpu');
  assert.deepEqual(normal.calls, ['webgpu']);
  pass('a working native WebGPU renderer stays preferred without replacement or fallback');

  const forced = setup();
  const forcedRenderer = await forced.initializeJellyRenderer(forced.host.current, forced.skin, forced.camera, 'webgl2');
  assert.equal(forcedRenderer.backend, 'webgl2');
  assert.equal(forced.host.current.attrs['data-renderer'], 'webgl2');
  assert.deepEqual(forced.calls, ['webgl2']);
  pass('the explicit verification path starts WebGL2 without probing WebGPU');

  const fallback = setup({ gpuFailure: true }), originalCanvas = fallback.host.current;
  const recovered = await fallback.initializeJellyRenderer(originalCanvas, fallback.skin, fallback.camera);
  assert.equal(recovered.backend, 'webgl2');
  assert.notEqual(fallback.host.current, originalCanvas);
  assert.equal(recovered.canvas, fallback.host.current);
  assert.equal(fallback.host.current.attrs.id, 'stage');
  assert.equal(fallback.host.current.attrs.tabindex, '0');
  assert.equal(fallback.host.current.attrs['data-i18n-aria'], 'canvasAria');
  assert.equal(fallback.host.current.attrs['data-renderer'], 'webgl2');
  assert.deepEqual(fallback.calls, ['webgpu', 'destroy-gpu', 'clone', 'replace', 'webgl2']);
  pass('WebGPU startup failure releases its device and gives WebGL2 a cloned canvas with the same controls and geometry');

  const unavailable = setup({ gpuFailure: true, glFailure: true });
  await assert.rejects(unavailable.initializeJellyRenderer(unavailable.host.current, unavailable.skin, unavailable.camera), /Native 3D graphics are unavailable.*WebGPU and WebGL2/);
  assert.equal(unavailable.host.current.attrs['data-renderer'], undefined, 'Failed startup must not announce a usable renderer.');
  assert.equal(unavailable.calls.filter(call => call === 'webgpu').length, 1);
  assert.equal(unavailable.calls.filter(call => call === 'webgl2').length, 1);
  pass('failure of both backends reports 3D unavailability without retry loops');

  const forcedUnavailable = setup({ glFailure: true });
  await assert.rejects(forcedUnavailable.initializeJellyRenderer(forcedUnavailable.host.current, forcedUnavailable.skin, forcedUnavailable.camera, 'webgl2'), /WebGL2 startup failure/);
  assert.deepEqual(forcedUnavailable.calls, ['webgl2']);
  pass('failure of the explicit WebGL2 verification path is reported directly');

  const cleanupChecks = [
    ['fragment compilation failure releases the successful vertex shader', async () => {
      const test = resourceSetup({ fragmentFailure: true });
      assert.throws(() => test.renderer.program('good vertex', 'bad fragment', 'test'), /expected fragment failure/);
      test.assertEmpty();
    }],
    ['program linking failure releases both shaders and the rejected program', async () => {
      const test = resourceSetup({ linkFailure: true });
      assert.throws(() => test.renderer.program('vertex', 'fragment', 'test'), /expected link failure/);
      test.assertEmpty();
    }],
    ['late initialization failure releases all programs, buffers, arrays and targets', async () => {
      const test = resourceSetup({ resourceFailure: true });
      await assert.rejects(test.renderer.init(test.canvas, test.skin, {}), /resources could not be initialized/);
      test.assertEmpty();
      test.renderer.dispose(); test.assertEmpty();
    }],
    ['an incomplete second framebuffer also releases its unassigned local texture and framebuffer', async () => {
      const test = resourceSetup({ incompleteFramebufferAt: 2 });
      await assert.rejects(test.renderer.init(test.canvas, test.skin, {}), /depth framebuffer is unavailable/);
      test.assertEmpty();
    }],
    ['vertex array setup failure releases its unassigned array and earlier allocations', async () => {
      const test = resourceSetup({ vertexAttributeFailureAt: 1 });
      await assert.rejects(test.renderer.init(test.canvas, test.skin, {}), /expected vertex attribute failure/);
      test.assertEmpty();
    }],
    ['successful initialization retains usable resources until an idempotent dispose', async () => {
      const test = resourceSetup();
      await test.renderer.init(test.canvas, test.skin, {});
      assert.deepEqual(test.counts(), { Shader: 0, Program: 5, Buffer: 3, VertexArray: 2, Texture: 2, Framebuffer: 2, Renderbuffer: 1 });
      test.renderer.dispose(); test.assertEmpty();
      test.renderer.dispose(); test.assertEmpty();
    }],
  ];
  const failures = [];
  for (const [name, check] of cleanupChecks) {
    try { await check(); pass(name); } catch (error) { failures.push(error); console.error('FAIL ' + name + ': ' + error.message); }
  }
  if (failures.length) throw new AggregateError(failures, `${failures.length} GL resource cleanup regressions failed.`);
  console.log(`PASS: ${passed} Node renderer selection/resource checks. No shader compilation, browser, Android hardware, or GPU rendering was exercised.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
