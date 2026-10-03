import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Script } from 'node:vm';

// Static guards for this standalone HTML export. This deliberately does not
// execute browser code or claim to validate GPU shaders or physical behavior.
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
assert.match(html, /^<!doctype html>/i, 'Expected a complete HTML document.');
assert.match(html, /<title>霸王龙软软糖(?:\s|<)/, 'Expected the product title.');
assert.match(html, /<canvas\b/, 'Expected a real rendering canvas.');

const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)];
assert.ok(scripts.length > 0, 'Expected inline JavaScript.');
for (const [index, match] of scripts.entries()) {
  assert.doesNotMatch(match[1], /\bsrc\s*=/i, 'External scripts are not allowed.');
  assert.doesNotMatch(match[1], /\btype\s*=\s*['"]module['"]/i, 'Check expects classic inline scripts.');
  new Script(match[2], { filename: `index.html:inline-script-${index + 1}` });
  assert.doesNotMatch(match[2], /\b(?:fetch|XMLHttpRequest|WebSocket|import)\s*\(/, 'Runtime network loading is not expected.');
}

// Resource-bearing attributes must use embedded data or same-document anchors.
// Ordinary links could be navigational, but this app intentionally has none.
const markup = html.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '');
for (const match of markup.matchAll(/\b(?:src|href|poster|srcset)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)) {
  const value = (match[1] ?? match[2] ?? match[3]).trim();
  assert.ok(value.startsWith('data:') || value.startsWith('#'), `Non-embedded resource: ${value}`);
}
for (const match of markup.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/gi)) {
  assert.ok(match[2].startsWith('data:') || match[2].startsWith('#'), `Non-embedded CSS resource: ${match[2]}`);
}
assert.doesNotMatch(markup, /@import\b/i, 'CSS imports are not allowed.');
assert.match(html, /navigator\.gpu/, 'Expected native WebGPU access.');
assert.match(html, /createShaderModule\s*\(/, 'Expected native shader creation.');
assert.match(html, /@vertex\s+fn/, 'Expected a WGSL vertex shader.');
assert.match(html, /@fragment\s+fn/, 'Expected a WGSL fragment shader.');

console.log(`PASS: ${scripts.length} inline script(s), JavaScript syntax, embedded resource references, and WebGPU/WGSL entry points.`);
console.log('Browser rendering, WGSL compilation, physics, and touch interaction require separate runtime verification.');
