import { execFileSync } from 'node:child_process';
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  lstatSync,
  realpathSync,
  renameSync,
  symlinkSync,
  unlinkSync,
  rmSync,
  mkdtempSync,
} from 'node:fs';
import { dirname, resolve, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { digest, fingerprintRepository } from '../src/verification.mjs';
import { fingerprintPackage, extractArtifact } from '../src/artifact-integrity.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(readFileSync(join(root, 'case.json')));
const sdk = join(root, config.repositories.find((r) => r.id === 'sdk').directory);
const ui = join(root, config.repositories.find((r) => r.id === 'ui').directory);
const artifacts = join(root, '.cache', 'artifacts');
mkdirSync(artifacts, { recursive: true });
const runNpm = (...args) =>
  execFileSync(join(dirname(process.execPath), 'npm'), args, {
    cwd: sdk,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    env: {
      ...process.env,
      PATH: dirname(process.execPath) + ':' + process.env.PATH,
      SCARF_ANALYTICS: 'false',
      HUSKY: '0',
    },
  });
const before = fingerprintRepository(sdk);
// Remove only known ignored generated build outputs from this fixture, never source.
for (const name of ['es', 'lib']) {
  const tracked = execFileSync('git', ['-C', sdk, 'ls-files', name], { encoding: 'utf8' });
  if (tracked.trim()) throw new Error('Refusing to clean tracked build output.');
  rmSync(join(sdk, name), { recursive: true, force: true });
}
console.log(runNpm('run', 'build:es'));
console.log(runNpm('run', 'build:commonjs'));
const pack = JSON.parse(
  runNpm(
    'pack',
    '--ignore-scripts',
    '--json',
    '--pack-destination',
    artifacts,
    `--userconfig=${join(root, '.cache/npm-user.npmrc')}`,
    `--globalconfig=${join(root, '.cache/npm-global.npmrc')}`,
    `--cache=${join(root, '.cache/npm')}`
  )
)[0];
const archive = join(artifacts, pack.filename);
const archiveHash = digest(readFileSync(archive));
const directory = join(root, '.cache', 'sdk-artifacts', archiveHash);
mkdirSync(directory, { recursive: true });
const listing = execFileSync('tar', ['-tzf', archive], { encoding: 'utf8' }).trim().split('\n');
if (listing.some((p) => !p.startsWith('package/') || p.split('/').includes('..')))
  throw new Error('Unsafe artifact path.');
const verbose = execFileSync('tar', ['-tvzf', archive], { encoding: 'utf8' }).trim().split('\n');
if (verbose.some((line) => !/^[-d]/.test(line)))
  throw new Error('Only regular files/directories are permitted in this artifact.');
const packageRoot = join(directory, 'package');
const inspection = mkdtempSync(join(directory, '.inspection-'));
let runtimeFingerprint;
try {
  extractArtifact(archive, inspection);
  const extracted = join(inspection, 'package');
  runtimeFingerprint = fingerprintPackage(extracted);
  if (!existsSync(packageRoot)) renameSync(extracted, packageRoot);
  else if (fingerprintPackage(packageRoot) !== runtimeFingerprint)
    throw new Error(
      'Cached artifact differs from its archive; inspect/quarantine it before retrying.'
    );
} finally {
  rmSync(inspection, { recursive: true, force: true });
}
const dependencies = join(packageRoot, 'node_modules');
if (!existsSync(dependencies)) symlinkSync(join(sdk, 'node_modules'), dependencies, 'dir');
const installed = join(ui, 'node_modules', 'swagger-client');
if (existsSync(installed) && lstatSync(installed).isSymbolicLink()) {
  const target = realpathSync(installed);
  if (!target.startsWith(join(root, '.cache', 'sdk-artifacts') + '/'))
    throw new Error('Refusing to replace an unrelated SDK link.');
  unlinkSync(installed);
} else if (existsSync(installed)) {
  const backup = join(root, '.cache', 'ui-registry-sdk-backup-' + Date.now());
  renameSync(installed, backup);
}
symlinkSync(packageRoot, installed, 'dir');
const requireUI = createRequire(join(ui, 'package.json'));
const resolvedPackage = requireUI.resolve('swagger-client/package.json');
if (realpathSync(dirname(resolvedPackage)) !== realpathSync(packageRoot))
  throw new Error('UI did not resolve the intended artifact.');
for (const target of ['es/execute/index.js', 'lib/execute/index.js']) {
  if (digest(readFileSync(join(sdk, target))) !== digest(readFileSync(join(packageRoot, target))))
    throw new Error('Built artifact content mismatch.');
}
if (before !== fingerprintRepository(sdk)) throw new Error('SDK source changed while packing.');
const report = {
  recordedAt: new Date().toISOString(),
  sourceFingerprint: before,
  artifactHash: archiveHash,
  archive: relative(root, archive),
  resolvedPackage: relative(root, resolvedPackage),
  packageRoot: relative(root, packageRoot),
  runtimeFingerprint,
  version: JSON.parse(readFileSync(resolvedPackage)).version,
  esExecuteHash: digest(readFileSync(join(packageRoot, 'es/execute/index.js'))),
  commonjsExecuteHash: digest(readFileSync(join(packageRoot, 'lib/execute/index.js'))),
  sdkLockHash: digest(readFileSync(join(sdk, 'package-lock.json'))),
  uiLockHash: digest(readFileSync(join(ui, 'package-lock.json'))),
  method:
    'Content-addressed local tarball, UI dependency symlink, SDK locked dependencies; no global npm link or registry substitution.',
  limitations:
    'This proves local resolution/content binding, not browser execution or a hardened immutable build sandbox.',
};
mkdirSync(join(root, 'evidence', 'runs'), { recursive: true });
writeFileSync(
  join(root, 'evidence', 'runs', 'sdk-artifact-binding.json'),
  JSON.stringify(report, null, 2) + '\n'
);
console.log(JSON.stringify(report, null, 2));
