import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fingerprintRepository } from '../src/verification.mjs';
import {
  snapshotRepository,
  containerArguments,
  isolationRuntime,
} from '../src/isolated-runtime.mjs';
test('snapshot copies bytes but not .git or ignored credentials, and does not dereference symlinks', () => {
  const top = mkdtempSync(join(tmpdir(), 'crossrepo-isolation-')),
    repo = join(top, 'repo'),
    out = join(top, 'snapshot');
  mkdirSync(repo);
  execFileSync('git', ['init', '-q', repo]);
  try {
    writeFileSync(join(repo, '.gitignore'), '.private\n');
    writeFileSync(join(repo, '.private'), 'not-for-worker');
    writeFileSync(join(repo, 'source.js'), 'source');
    symlinkSync('/unmounted/private/file', join(repo, 'link'));
    const r = snapshotRepository(repo, out);
    assert.ok(r.files >= 3);
    assert.equal(readFileSync(join(out, 'source.js'), 'utf8'), 'source');
    assert.throws(() => readFileSync(join(out, '.private')));
    assert.throws(() => readFileSync(join(out, '.git/config')));
  } finally {
    rmSync(top, { recursive: true, force: true });
  }
});
test('tracked paths beneath a replaced ancestor symlink cannot copy or fingerprint outside data', () => {
  const top = mkdtempSync(join(tmpdir(), 'crossrepo-ancestor-')),
    repo = join(top, 'repo'),
    secret = join(top, 'outside');
  mkdirSync(repo);
  mkdirSync(secret);
  mkdirSync(join(repo, 'tracked'));
  execFileSync('git', ['init', '-q', repo]);
  writeFileSync(join(repo, 'tracked', 'config.json'), 'public');
  execFileSync('git', ['-C', repo, 'add', '.']);
  writeFileSync(join(secret, 'config.json'), 'synthetic-private-canary');
  rmSync(join(repo, 'tracked'), { recursive: true });
  symlinkSync(secret, join(repo, 'tracked'));
  try {
    assert.throws(() => snapshotRepository(repo, join(top, 'out')), /ancestor/);
    assert.throws(() => fingerprintRepository(repo), /ancestor/);
  } finally {
    rmSync(top, { recursive: true, force: true });
  }
});
test('remote Docker hosts are refused before any remote command is attempted', () => {
  const old = process.env.DOCKER_HOST;
  try {
    process.env.DOCKER_HOST = 'tcp://example.invalid:2375';
    assert.throws(() => isolationRuntime('/unused'), /local Unix/);
  } finally {
    if (old === undefined) delete process.env.DOCKER_HOST;
    else process.env.DOCKER_HOST = old;
  }
});
test('container profile has no network/privilege/writable binds or inherited token environment', () => {
  const runtime = {
    imageId: 'sha256:fixture',
    config: { pidsLimit: 64, memory: '1536m', cpus: '2', tmpfsBytes: 1024 },
  };
  const args = containerArguments(runtime, 'crossrepo-check-fixture', '/source', '/entrypoint', [
    ['/deps', '/work/node_modules'],
  ]);
  for (const v of ['--pull=never', '--read-only', '--cap-drop', 'no-new-privileges'])
    assert.ok(args.includes(v));
  assert.equal(args[args.indexOf('--network') + 1], 'none');
  assert.ok(args.filter((x) => x.startsWith('type=bind')).every((x) => x.endsWith(',readonly')));
  assert.ok(!args.some((x) => /API_KEY|TOKEN|docker.sock/.test(x)));
});
