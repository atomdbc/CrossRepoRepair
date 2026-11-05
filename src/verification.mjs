import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync, readlinkSync } from 'node:fs';
import { resolve, sep, isAbsolute } from 'node:path';

export const digest = (data) => createHash('sha256').update(data).digest('hex');
export const acceptanceMatches = (data, expectedHash) =>
  typeof expectedHash === 'string' &&
  /^[a-f0-9]{64}$/.test(expectedHash) &&
  digest(data) === expectedHash;

// Reject static ancestor-symlink escapes before any content read. The trusted
// coordinator must prepare snapshots before starting untrusted processes; this
// is not a race-proof openat2 boundary against a concurrent privileged host.
export function safeRepositoryEntry(directory, relative) {
  const root = resolve(directory),
    file = resolve(root, relative),
    parts = relative.split('/');
  if (
    isAbsolute(relative) ||
    !file.startsWith(root + sep) ||
    parts.some((p) => !p || p === '.' || p === '..') ||
    lstatSync(root).isSymbolicLink()
  )
    throw Error('Source path escapes repository');
  let parent = root;
  for (const part of parts.slice(0, -1)) {
    parent = resolve(parent, part);
    try {
      const stat = lstatSync(parent);
      if (stat.isSymbolicLink() || !stat.isDirectory()) throw Error('Unsafe source ancestor');
    } catch (error) {
      if (error.code === 'ENOENT') break;
      throw error;
    }
  }
  return file;
}

// Includes changed tracked files and non-ignored untracked source, not merely HEAD.
// This binds content, but does not implement an isolated immutable build snapshot.
export function fingerprintRepository(directory) {
  const root = resolve(directory);
  const list = (args) =>
    execFileSync('git', ['-c', 'core.fsmonitor=false', '-C', root, 'ls-files', '-z', ...args], {
      encoding: 'utf8',
    })
      .split('\0')
      .filter(Boolean);
  const files = [...new Set([...list([]), ...list(['--others', '--exclude-standard'])])].sort();
  const hash = createHash('sha256');
  for (const relative of files) {
    const file = safeRepositoryEntry(root, relative);
    hash.update(JSON.stringify(relative));
    try {
      const stat = lstatSync(file);
      hash.update(String(stat.mode & 0o7777));
      if (stat.isSymbolicLink()) hash.update('symlink:' + readlinkSync(file));
      else if (stat.isFile()) hash.update(digest(readFileSync(file)));
      else hash.update('non-file');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      hash.update('deleted');
    }
  }
  return hash.digest('hex');
}

export function classifyJest(report, exitCode) {
  if (
    !report ||
    !Array.isArray(report.testResults) ||
    !report.testResults.length ||
    !Number.isInteger(report.numTotalTests) ||
    report.numTotalTests < 1
  )
    return 'infrastructure_error';
  if (
    report.testResults.some(
      (suite) =>
        suite.testExecError ||
        (suite.message && (!suite.assertionResults || !suite.assertionResults.length))
    )
  )
    return 'infrastructure_error';
  if (report.numFailedTests > 0 && exitCode === 1) return 'behavioural_failure';
  if (report.success === true && report.numFailedTests === 0 && exitCode === 0) return 'passed';
  return 'infrastructure_error';
}
