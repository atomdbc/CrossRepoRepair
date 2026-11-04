import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { classifyJest, fingerprintRepository, acceptanceMatches, digest } from '../src/verification.mjs';

const result = (overrides = {}) => ({
  success: true, numTotalTests: 2, numFailedTests: 0,
  testResults: [{ assertionResults: [{ status: 'passed' }] }], ...overrides,
});

test('acceptance edits cannot silently redefine the pinned passing target', () => {
  const source = Buffer.from('original expectations');
  const hash = digest(source);
  assert.equal(acceptanceMatches(source, hash), true);
  assert.equal(acceptanceMatches(Buffer.from('weakened expectations'), hash), false);
  assert.equal(acceptanceMatches(source, undefined), false);
});

test('a passing command with no assertions is not a passing test suite', () => {
  assert.equal(classifyJest(null, 0), 'infrastructure_error');
  assert.equal(classifyJest(result({ numTotalTests: 0 }), 0), 'infrastructure_error');
});
test('compile failures are not evidence of the requested behavioural bug', () => {
  assert.equal(classifyJest(result({ testResults: [{ message: 'Compile failed', assertionResults: [] }] }), 1), 'infrastructure_error');
});
test('actual assertion failures and success are distinguished', () => {
  assert.equal(classifyJest(result({ success: false, numFailedTests: 1 }), 1), 'behavioural_failure');
  assert.equal(classifyJest(result(), 0), 'passed');
});
test('an exit-code/result mismatch fails closed', () => {
  assert.equal(classifyJest(result(), 1), 'infrastructure_error');
  assert.equal(classifyJest(result({ success: false, numFailedTests: 1 }), 0), 'infrastructure_error');
});
test('fingerprint notices uncommitted tracked and untracked content changes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'crossrepo-fingerprint-'));
  try {
    execFileSync('git', ['init', '-q', dir]);
    writeFileSync(join(dir, 'tracked.txt'), 'before');
    execFileSync('git', ['-C', dir, 'add', 'tracked.txt']);
    const before = fingerprintRepository(dir);
    writeFileSync(join(dir, 'tracked.txt'), 'after');
    const changed = fingerprintRepository(dir);
    assert.notEqual(before, changed);
    writeFileSync(join(dir, 'new.txt'), 'new source');
    assert.notEqual(changed, fingerprintRepository(dir));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('fingerprinting records a symlink instead of reading its target', () => {
  const dir = mkdtempSync(join(tmpdir(), 'crossrepo-symlink-'));
  try {
    execFileSync('git', ['init', '-q', dir]);
    symlinkSync('/this/target/does/not/exist', join(dir, 'link'));
    assert.match(fingerprintRepository(dir), /^[a-f0-9]{64}$/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
