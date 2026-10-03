'use strict';

// Exercise the real publication script with isolated CLI stand-ins. No GitHub,
// credential store, network, or real Git repository write is used by this test.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const projectDir = path.resolve(__dirname, '..');
const records = ['PROJECT.md', 'MEMORY.md', 'TASKS.md', 'WORKLOG.md'];
const apkFile = 'downloads/trex-jelly-android-v1.3.0.apk';
const releaseAssets = ['tests/fullscreen.cjs', 'tests/adapter.cjs', 'tests/renderer.cjs', 'design/toy-icons.png', 'design/2026-10-03-toy-icons-prompt.json', apkFile];
const androidSources = [
  'android/.gitignore', 'android/README.md', 'android/settings.gradle', 'android/build.gradle', 'android/gradle.properties',
  'android/build-local.sh', 'android/gradlew', 'android/gradlew.bat',
  'android/gradle/wrapper/gradle-wrapper.jar', 'android/gradle/wrapper/gradle-wrapper.properties',
  'android/tests/LocalContentPolicyTest.java', 'android/app/build.gradle', 'android/app/src/main/AndroidManifest.xml',
  'android/app/src/main/java/life/breeze/trexjelly/MainActivity.java',
  'android/app/src/main/java/life/breeze/trexjelly/LocalContentPolicy.java',
  'android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml', 'android/app/src/main/res/drawable/ic_trex_foreground.xml',
  'android/app/src/main/res/values/colors.xml', 'android/app/src/main/res/values/strings.xml',
  'android/app/src/main/res/values/themes.xml', 'android/app/src/main/res/values-v27/themes.xml',
  'android/app/src/main/res/values-en/strings.xml',
];
const publicationPayload = [...records, ...releaseAssets, ...androidSources, 'downloads/README.md', 'SHA256SUMS'];
const fixtureSources = [
  'index.html', '.nojekyll', '.gitignore', 'README.md', 'package.json',
  'scripts', 'tests', 'preview', 'design', 'publish-github-pages.sh', 'START_HERE.md',
  'AGENTS.md', 'CODEX_HANDOFF.md', 'TEST_REPORT.md', 'SHA256SUMS', 'android', 'downloads',
];
const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'trex-publish-test-'));
let passed = 0;

// The mocks reject unknown operations and only copy local fixture bytes. The
// staged/committed/pushed snapshots let assertions inspect what was published,
// rather than merely looking for filenames in the script's source.
const mockSource = String.raw`
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = process.env.TREX_MOCK_CASE;
const statePath = path.join(root, 'state.json');
const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
const tool = path.basename(process.argv[1]);
const args = process.argv.slice(2);
const target = 'BreezeLife/trex-soft-candy';
const targetUrl = 'https://github.com/' + target + '.git';
const pagesUrl = 'https://breezelife.github.io/trex-soft-candy/';
fs.appendFileSync(path.join(root, 'calls.jsonl'), JSON.stringify({ tool, args }) + '\n');
function save() { fs.writeFileSync(statePath, JSON.stringify(state)); }
function output(value) { process.stdout.write(value + '\n'); }
function reject(message) { process.stderr.write('Mock rejected: ' + message + '\n'); process.exit(97); }
function check(condition, message) { if (!condition) reject(message); }
function files(dir, prefix = '') {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const name = path.join(prefix, entry.name);
    if (entry.name === '.git') return [];
    if (entry.isDirectory()) return files(path.join(dir, entry.name), name);
    check(entry.isFile() || entry.isSymbolicLink(), 'nonregular tracked fixture');
    return [name];
  });
}
function snapshot(dir, names, destination) {
  fs.rmSync(destination, { recursive: true, force: true });
  fs.mkdirSync(destination, { recursive: true });
  for (const name of names) {
    check(!path.isAbsolute(name) && !name.split(path.sep).includes('..'), 'unsafe staged path');
    const from = path.join(dir, name);
    const stat = fs.lstatSync(from);
    check(stat.isFile() || stat.isSymbolicLink(), 'tracked file missing or nonregular');
    const to = path.join(destination, name);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    if (stat.isSymbolicLink()) fs.symlinkSync(fs.readlinkSync(from), to);
    else fs.copyFileSync(from, to);
  }
}
if (tool === 'gh') {
  const normalized = args.filter((value, index) => value !== '--hostname' && args[index - 1] !== '--hostname');
  if (normalized[0] === 'auth') {
    check(normalized.join(' ') === 'auth status', 'only existing authorization status may be checked');
    process.exit(state.authAvailable ? 0 : 1);
  }
  if (normalized[0] === 'repo') {
    check(normalized[1] === 'create' && normalized[2] === target && normalized.includes('--public'), 'unexpected repository creation');
    check(!state.repositoryExists, 'repository already exists');
    state.repositoryExists = true; save(); process.exit(0);
  }
  check(normalized[0] === 'api', 'unexpected gh command');
  const methodIndex = normalized.indexOf('--method');
  const method = methodIndex < 0 ? 'GET' : normalized[methodIndex + 1];
  const endpoint = methodIndex < 0 ? normalized[1] : normalized[methodIndex + 2];
  const jq = normalized[normalized.indexOf('--jq') + 1];
  if (endpoint === 'user' && method === 'GET') {
    output(jq === '.login' ? state.account : '3711161+' + state.account + '@users.noreply.github.com');
    process.exit(0);
  }
  check(endpoint.startsWith('repos/' + target), 'different repository');
  if (endpoint === 'repos/' + target && method === 'GET') {
    if (!state.repositoryExists) { process.stderr.write('gh: Not Found (HTTP 404)\n'); process.exit(1); }
    output('false\tfalse'); process.exit(0);
  }
  if (endpoint === 'repos/' + target + '/pages') {
    if (method === 'GET') {
      if (!state.pagesExists) { process.stderr.write('gh: Not Found (HTTP 404)\n'); process.exit(1); }
      output(jq === '.html_url' ? pagesUrl : 'legacy\tmain\t/'); process.exit(0);
    }
    check(['POST', 'PUT'].includes(method), 'unexpected Pages mutation');
    check(method === (state.pagesExists ? 'PUT' : 'POST'), 'wrong Pages REST method');
    for (const field of ['build_type=legacy', 'source[branch]=main', 'source[path]=/']) {
      check(normalized.includes(field), 'unexpected Pages source');
    }
    state.pagesExists = true; save(); process.exit(0);
  }
  if (endpoint === 'repos/' + target + '/pages/builds/latest' && method === 'GET') {
    check(state.pushedSha, 'build queried before push');
    output('built\t' + state.pushedSha); process.exit(0);
  }
  reject('unexpected gh API request');
}
if (tool === 'git') {
  check(!args.some(value => ['--force', '--force-with-lease', '-f', '--global', '--system'].includes(value)), 'unsafe Git option');
  let cursor = 0;
  let dir;
  while (args[cursor] === '-c' || args[cursor] === '-C') {
    if (args[cursor] === '-C') dir = args[cursor + 1];
    else check(['credential.helper=', 'credential.helper=!gh auth git-credential'].includes(args[cursor + 1]), 'unexpected Git configuration');
    cursor += 2;
  }
  const command = args[cursor++];
  const rest = args.slice(cursor);
  if (command === 'ls-remote') {
    check(rest.includes(targetUrl), 'different remote');
    if (state.existingMain) output(state.oldSha + '\trefs/heads/main');
    process.exit(0);
  }
  if (command === 'clone') {
    check(rest.includes(targetUrl) && rest.includes('main'), 'different clone target');
    state.gitDir = rest.at(-1);
    fs.cpSync(path.join(root, 'remote'), state.gitDir, { recursive: true, verbatimSymlinks: true });
    state.tracked = files(state.gitDir); state.staged = []; state.sha = state.oldSha;
    snapshot(state.gitDir, state.tracked, path.join(root, 'committed')); save(); process.exit(0);
  }
  if (command === 'init') {
    state.gitDir = rest.at(-1); fs.mkdirSync(state.gitDir, { recursive: true });
    state.tracked = []; state.staged = []; state.sha = null; save(); process.exit(0);
  }
  check(dir === state.gitDir, 'operation outside temporary publication repository');
  if (command === 'symbolic-ref') { check(rest.join(' ') === 'HEAD refs/heads/main', 'unexpected branch'); process.exit(0); }
  if (command === 'remote') { check(rest.join(' ') === 'add origin ' + targetUrl, 'unexpected remote'); process.exit(0); }
  if (command === 'config') { check(['user.name', 'user.email'].includes(rest[0]), 'nonlocal author configuration'); process.exit(0); }
  if (command === 'add') {
    check(rest[0] === '--', 'ambiguous staged paths');
    state.staged = rest.slice(1);
    for (const name of state.staged) check(fs.lstatSync(path.join(dir, name)).isFile(), 'invalid staged file');
    save(); process.exit(0);
  }
  if (command === 'diff') {
    check(rest.join(' ') === '--cached --quiet', 'unexpected diff');
    const changed = state.staged.some(name => {
      const previous = path.join(root, 'committed', name);
      return !fs.existsSync(previous) || !fs.readFileSync(previous).equals(fs.readFileSync(path.join(dir, name)));
    });
    process.exit(changed ? 1 : 0);
  }
  if (command === 'commit') {
    check(rest[0] === '-m' && state.staged.length, 'unexpected commit');
    state.tracked = [...new Set([...state.tracked, ...state.staged])];
    snapshot(dir, state.tracked, path.join(root, 'committed'));
    state.sha = state.publishSha; save(); process.exit(0);
  }
  if (command === 'push') {
    check(rest.join(' ') === 'origin main' && state.sha, 'unexpected push');
    fs.cpSync(path.join(root, 'committed'), path.join(root, 'pushed'), { recursive: true });
    state.pushedSha = state.sha; save(); process.exit(0);
  }
  if (command === 'rev-parse') { check(rest.join(' ') === 'HEAD', 'unexpected revision'); output(state.sha); process.exit(0); }
  reject('unexpected Git command');
}
if (tool === 'curl') {
  check(args.includes(pagesUrl + '?verify=' + state.pushedSha), 'unexpected HTTPS target or commit');
  check(args.includes('--proto') && args.includes('=https'), 'HTTPS protocol restriction missing');
  const destination = args[args.indexOf('-o') + 1];
  check(destination && path.resolve(destination).startsWith(root + path.sep), 'output outside sandbox');
  fs.copyFileSync(path.join(root, 'pushed', 'index.html'), destination); process.exit(0);
}
reject('unknown CLI');
`;

function runCase(name, options = {}) {
  const root = path.join(sandbox, name);
  const fixture = path.join(root, 'project');
  const bin = path.join(root, 'bin');
  fs.mkdirSync(fixture, { recursive: true });
  fs.mkdirSync(bin);
  fs.mkdirSync(path.join(root, 'tmp'));
  for (const source of fixtureSources) {
    const from = path.join(projectDir, source);
    // Optional, explicit fixture recovery for legacy preview files whose iCloud
    // hydration is blocked. Read only reviewed HEAD blobs; do not replace source
    // files or use these bytes to claim the current checkout was verified.
    if (source === 'preview' && process.env.TREX_MOCK_PREVIEW_FROM_HEAD === '1') {
      const destination = path.join(fixture, source);
      fs.mkdirSync(destination);
      for (const name of ['coral.png', 'lagoon.png', 'grape.png']) {
        const blob = spawnSync('git', ['-C', projectDir, 'show', 'HEAD:preview/' + name], { maxBuffer: 2 ** 21 });
        assert.equal(blob.status, 0, 'Cannot read reviewed preview fixture from local Git');
        fs.writeFileSync(path.join(destination, name), blob.stdout);
      }
      continue;
    }
    fs.cpSync(from, path.join(fixture, source), {
      recursive: true,
      filter: candidate => source !== 'android' || !path.relative(from, candidate).split(path.sep).some(part =>
        ['.git', '.local', '.gradle', '.gradle-cache', 'build', '.idea', 'local.properties'].includes(part) || /\.(keystore|jks)$/.test(part)),
    });
  }
  // Publication mocks test binary transport, independently of an actual APK
  // build. Prefer the real exported package once it exists; otherwise use bytes
  // that include NUL/high-bit values. Actual APK/signature checks run separately.
  if (!fs.existsSync(path.join(fixture, apkFile))) fs.writeFileSync(path.join(fixture, apkFile), Buffer.from([0x50, 0x4b, 0, 0xff, 0x80, 0x0a]));
  for (const name of ['.local', '.gradle', '.gradle-cache', 'build', 'local.properties']) {
    assert(!fs.existsSync(path.join(fixture, 'android', name)), 'private Android files must not enter publication fixtures');
  }
  for (const record of records) fs.writeFileSync(path.join(fixture, record), '# ' + record + '\nPublication fixture: ' + name + '\n');
  if (options.missing) fs.unlinkSync(path.join(fixture, options.missing));
  if (options.symlink) {
    fs.unlinkSync(path.join(fixture, options.symlink));
    fs.symlinkSync(path.join(fixture, 'README.md'), path.join(fixture, options.symlink));
  }
  if (options.existingMain) {
    fs.cpSync(fixture, path.join(root, 'remote'), { recursive: true });
    if (options.importPayload) for (const file of publicationPayload) fs.unlinkSync(path.join(root, 'remote', file));
    if (options.conflict) fs.writeFileSync(path.join(root, 'remote', options.conflict), 'Unreviewed remote decision.\n');
    if (options.symlinkParent) {
      fs.rmSync(path.join(root, 'remote', options.symlinkParent), { recursive: true });
      fs.mkdirSync(path.join(root, 'external-parent'));
      fs.writeFileSync(path.join(root, 'external-parent', 'sentinel.txt'), 'Do not write outside the cloned repository.\n');
      fs.symlinkSync(path.join(root, 'external-parent'), path.join(root, 'remote', options.symlinkParent));
    }
    fs.writeFileSync(path.join(root, 'remote', 'remote-extra.txt'), 'Preserve this existing file.\n');
  }
  fs.writeFileSync(path.join(root, 'state.json'), JSON.stringify({
    account: 'BreezeLife', authAvailable: true, repositoryExists: Boolean(options.existingMain),
    pagesExists: Boolean(options.existingMain), existingMain: Boolean(options.existingMain),
    oldSha: 'a'.repeat(40), publishSha: 'b'.repeat(40), ...options,
  }));
  for (const tool of ['gh', 'git', 'curl']) fs.writeFileSync(path.join(bin, tool), '#!' + process.execPath + '\n' + mockSource, { mode: 0o755 });
  fs.symlinkSync(process.execPath, path.join(bin, 'node'));
  const result = spawnSync('/bin/bash', [path.join(fixture, 'publish-github-pages.sh')], {
    cwd: root, encoding: 'utf8', timeout: 15000,
    env: { PATH: bin + ':/usr/bin:/bin', TMPDIR: path.join(root, 'tmp'), TREX_MOCK_CASE: root },
  });
  const logPath = path.join(root, 'calls.jsonl');
  const calls = fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf8').trim().split('\n').map(line => JSON.parse(line)) : [];
  assert.equal(result.signal, null, result.error?.message || result.stderr);
  assert(!calls.some(call => call.args.includes('login') || call.args.includes('token')), 'must only reuse existing authorization');
  return { root, fixture, result, calls };
}

function noPublication(test) {
  assert.notEqual(test.result.status, 0, test.result.stdout);
  assert(!test.calls.some(call => call.tool === 'gh' && call.args[0] === 'repo'), 'must not create a repository');
  assert(!test.calls.some(call => call.tool === 'git' && call.args.includes('push')), 'must not push');
  assert(!test.calls.some(call => call.tool === 'gh' && call.args.includes('--method')), 'must not modify Pages');
}
function pass(name) { passed++; console.log('PASS ' + name); }

try {
  for (const file of [...records, ...releaseAssets]) {
    const test = runCase('missing-' + file.replaceAll('/', '-'), { missing: file });
    noPublication(test);
    assert(test.result.stderr.includes(file), 'must identify missing publication file');
    pass('missing ' + file + ' stops before repository creation or push');
  }
  const symlink = runCase('symlink-record', { symlink: 'MEMORY.md' });
  noPublication(symlink);
  pass('symlinked project record is rejected');

  for (const existingMain of [false, true]) {
    const test = runCase(existingMain ? 'existing-main' : 'new-repository', { existingMain, importPayload: existingMain });
    assert.equal(test.result.status, 0, test.result.stderr + test.result.stdout);
    for (const file of publicationPayload) {
      assert(fs.readFileSync(path.join(test.root, 'pushed', file)).equals(fs.readFileSync(path.join(test.fixture, file))), file + ' must be committed and pushed byte-for-byte');
    }
    assert.equal(test.calls.filter(call => call.tool === 'git' && call.args.includes('push')).length, 1);
    assert.equal(test.calls.filter(call => call.tool === 'gh' && call.args[0] === 'repo').length, existingMain ? 0 : 1);
    assert(test.result.stdout.includes('GitHub Pages 已上线并验证'), 'must verify the pushed commit and HTTPS content');
    if (existingMain) assert.equal(fs.readFileSync(path.join(test.root, 'pushed', 'remote-extra.txt'), 'utf8'), 'Preserve this existing file.\n');
    pass((existingMain ? 'existing main imports records/assets and preserves extra files' : 'new repository publishes all required records/assets') + ' with verified mock Pages');
  }

  for (const file of ['MEMORY.md', 'design/2026-10-03-toy-icons-prompt.json']) {
    const conflict = runCase('remote-conflict-' + file.replaceAll('/', '-'), { existingMain: true, conflict: file });
    noPublication(conflict);
    assert(conflict.result.stderr.includes(file), 'must identify the unreviewed remote difference');
    assert.equal(fs.readFileSync(path.join(conflict.root, 'remote', file), 'utf8'), 'Unreviewed remote decision.\n');
    pass('unreviewed remote ' + file + ' stops without overwriting or pushing');
  }

  for (const parent of ['design', 'android/app/src', 'downloads']) {
    const test = runCase('remote-symlink-' + parent.replaceAll('/', '-'), { existingMain: true, symlinkParent: parent });
    noPublication(test);
    assert(test.result.stderr.includes(parent), 'must identify the unsafe parent directory');
    assert.deepEqual(fs.readdirSync(path.join(test.root, 'external-parent')), ['sentinel.txt'], 'must not write through the remote parent symlink');
    assert.equal(fs.readFileSync(path.join(test.root, 'external-parent', 'sentinel.txt'), 'utf8'), 'Do not write outside the cloned repository.\n');
    pass('remote ' + parent + ' symlink stops before copying outside the cloned repository');
  }

  for (const options of [{ account: 'DifferentUser' }, { authAvailable: false }]) {
    const test = runCase(options.account ? 'wrong-account' : 'missing-authorization', options);
    noPublication(test);
    assert(!test.calls.some(call => call.tool === 'git'), 'authorization must be checked before any Git operation');
    pass(options.account ? 'wrong account cannot publish' : 'missing existing authorization cannot publish');
  }
  console.log('\n' + passed + ' isolated publication mock checks passed. No real GitHub calls or deployment were performed.');
} finally {
  fs.rmSync(sandbox, { recursive: true, force: true });
}
