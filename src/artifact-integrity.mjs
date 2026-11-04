import { lstatSync, readdirSync, readFileSync, readlinkSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { digest } from './verification.mjs';

// Hash shipped package bytes, not the externally linked dependency installation.
export function fingerprintPackage(directory) {
  if (!lstatSync(directory).isDirectory()) throw new Error('Artifact root must be a real directory');
  const entries = [];
  function walk(relative = '') {
    for (const name of readdirSync(join(directory, relative)).sort()) {
      if (!relative && name === 'node_modules') continue;
      const path = relative ? relative + '/' + name : name, absolute = join(directory, path), stat = lstatSync(absolute);
      if (stat.isSymbolicLink()) entries.push([path, 'link', readlinkSync(absolute)]);
      else if (stat.isDirectory()) { entries.push([path, 'directory']); walk(path); }
      else if (stat.isFile()) entries.push([path, 'file', stat.mode & 0o111, digest(readFileSync(absolute))]);
      else throw new Error('Unsupported artifact entry');
    }
  }
  walk();
  return digest(JSON.stringify(entries));
}
export function runtimeArtifactMatches({ installed, packageRoot, dependencies, expectedFingerprint }) {
  try {
    return !!expectedFingerprint && realpathSync(installed) === realpathSync(packageRoot) &&
      fingerprintPackage(packageRoot) === expectedFingerprint &&
      lstatSync(join(packageRoot, 'node_modules')).isSymbolicLink() &&
      realpathSync(join(packageRoot, 'node_modules')) === realpathSync(dependencies);
  } catch { return false; }
}
