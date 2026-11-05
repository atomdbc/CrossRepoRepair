import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import {
  fingerprintPackage,
  runtimeArtifactMatches,
  extractArtifact,
} from '../src/artifact-integrity.mjs';
test('artifact extraction pins executable permissions and restores the caller umask', () => {
  const root = mkdtempSync(join(tmpdir(), 'crossrepo-umask-')),
    previous = process.umask();
  try {
    const source = join(root, 'source'),
      pkg = join(source, 'package'),
      archive = join(root, 'sample.tgz');
    mkdirSync(pkg, { recursive: true });
    writeFileSync(join(pkg, 'index.js'), 'public-fixture');
    chmodSync(join(pkg, 'index.js'), 0o755);
    execFileSync('tar', ['-czf', archive, '-C', source, 'package']);
    const a = join(root, 'a'),
      b = join(root, 'b');
    mkdirSync(a);
    mkdirSync(b);
    process.umask(0o022);
    extractArtifact(archive, a);
    assert.equal(process.umask(), 0o022);
    process.umask(0o077);
    extractArtifact(archive, b);
    assert.equal(process.umask(), 0o077);
    assert.equal(fingerprintPackage(join(a, 'package')), fingerprintPackage(join(b, 'package')));
  } finally {
    process.umask(previous);
    rmSync(root, { recursive: true, force: true });
  }
});
test('artifact hashing detects changes outside the execute entry point', () => {
  const root = mkdtempSync(join(tmpdir(), 'crossrepo-artifact-'));
  try {
    writeFileSync(join(root, 'helper.js'), 'original');
    const before = fingerprintPackage(root);
    writeFileSync(join(root, 'helper.js'), 'changed');
    assert.notEqual(fingerprintPackage(root), before);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test('an intact archive identity cannot hide a retargeted UI dependency', () => {
  const root = mkdtempSync(join(tmpdir(), 'crossrepo-link-'));
  try {
    const pkg = join(root, 'package'),
      deps = join(root, 'dependencies'),
      other = join(root, 'other');
    for (const d of [pkg, deps, other]) mkdirSync(d);
    writeFileSync(join(pkg, 'package.json'), '{}');
    symlinkSync(deps, join(pkg, 'node_modules'), 'dir');
    const args = {
      installed: pkg,
      packageRoot: pkg,
      dependencies: deps,
      expectedFingerprint: fingerprintPackage(pkg),
    };
    assert.equal(runtimeArtifactMatches(args), true);
    assert.equal(runtimeArtifactMatches({ ...args, installed: other }), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
