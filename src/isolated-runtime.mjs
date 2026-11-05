import { execFileSync, spawnSync } from 'node:child_process';
import {
  readFileSync,
  writeFileSync,
  readdirSync,
  mkdirSync,
  lstatSync,
  readlinkSync,
  symlinkSync,
  realpathSync,
} from 'node:fs';
import { join, dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { digest, safeRepositoryEntry } from './verification.mjs';
import { fingerprintPackage } from './artifact-integrity.mjs';

const modulePath = fileURLToPath(import.meta.url);
const docker = (args, options = {}) =>
  execFileSync('docker', args, {
    encoding: 'utf8',
    timeout: 20000,
    maxBuffer: 1024 * 1024,
    ...options,
  });
export function isolationRuntime(root) {
  if (process.env.DOCKER_HOST && !process.env.DOCKER_HOST.startsWith('unix://'))
    throw Error('Only a local Unix-socket Docker daemon is allowed');
  const endpoint = docker(['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}']).trim();
  if (!endpoint.startsWith('unix://')) throw Error('Remote Docker execution is not authorised');
  const bytes = readFileSync(join(root, 'isolation.json')),
    config = JSON.parse(bytes);
  if (
    config.version !== 1 ||
    config.pullPolicy !== 'never' ||
    !/^node@sha256:[a-f0-9]{64}$/.test(config.image)
  )
    throw Error('Invalid pinned isolation configuration');
  const image = JSON.parse(docker(['image', 'inspect', config.image]))[0];
  if (image.Os !== 'linux' || `${image.Os}/${image.Architecture}` !== config.platform)
    throw Error('Installed image platform does not match configuration');
  return {
    version: 1,
    imageId: image.Id,
    imageReference: config.image,
    platform: config.platform,
    nodeVersion: config.imageNodeVersion,
    profileHash: digest(
      Buffer.concat([
        bytes,
        readFileSync(modulePath),
        readFileSync(join(root, 'src/verification.mjs')),
        readFileSync(join(root, 'src/artifact-integrity.mjs')),
      ])
    ),
    config,
  };
}

export function snapshotRepository(repository, destination) {
  mkdirSync(destination, { recursive: true });
  const files = execFileSync(
    'git',
    [
      '-c',
      'core.fsmonitor=false',
      '-C',
      repository,
      'ls-files',
      '-z',
      '--cached',
      '--others',
      '--exclude-standard',
    ],
    { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }
  )
    .split('\0')
    .filter(Boolean);
  const entries = [];
  for (const name of [...new Set(files)].sort()) {
    const source = safeRepositoryEntry(repository, name),
      target = resolve(destination, name);
    if (
      !source.startsWith(resolve(repository) + sep) ||
      !target.startsWith(resolve(destination) + sep) ||
      name.split('/').includes('.git') ||
      name.split('/').includes('node_modules')
    )
      throw Error('Unsafe snapshot entry');
    let stat;
    try {
      stat = lstatSync(source);
    } catch (e) {
      if (e.code === 'ENOENT') {
        entries.push({ path: name, kind: 'deleted' });
        continue;
      }
      throw e;
    }
    mkdirSync(dirname(target), { recursive: true });
    if (stat.isSymbolicLink()) {
      const link = readlinkSync(source);
      symlinkSync(link, target);
      entries.push({ path: name, kind: 'symlink', target: link });
    } else if (stat.isFile()) {
      const bytes = readFileSync(source);
      writeFileSync(target, bytes, { flag: 'wx', mode: stat.mode & 0o111 ? 0o555 : 0o444 });
      entries.push({ path: name, kind: 'file', hash: digest(bytes) });
    } else throw Error('Unsupported snapshot entry: ' + name);
  }
  return { files: entries.length, manifestHash: digest(JSON.stringify(entries)) };
}

export function containerArguments(runtime, name, source, entrypoint, mounts = []) {
  const uid = process.getuid(),
    gid = process.getgid();
  if (!Number.isInteger(uid) || uid === 0) throw Error('Run this demo as a non-root host user');
  const args = [
    'run',
    '--pull=never',
    '--name',
    name,
    '--network',
    'none',
    '--read-only',
    '--cap-drop',
    'ALL',
    '--security-opt',
    'no-new-privileges',
    '--pids-limit',
    String(runtime.config.pidsLimit),
    '--memory',
    runtime.config.memory,
    '--memory-swap',
    runtime.config.memory,
    '--cpus',
    runtime.config.cpus,
    '--user',
    `${uid}:${gid}`,
    '--workdir',
    '/work',
    '--tmpfs',
    `/tmp:rw,nosuid,nodev,noexec,size=${runtime.config.tmpfsBytes},mode=1777`,
    '--env',
    'HOME=/tmp/home',
    '--env',
    'CI=true',
    '--env',
    'NODE_ENV=test',
    '--env',
    'BABEL_ENV=commonjs',
    '--env',
    'BROWSERSLIST_ENV=node-development',
    '--env',
    'SCARF_ANALYTICS=false',
    '--env',
    'HUSKY=0',
  ];
  for (const [from, to] of [[source, '/work'], [entrypoint, '/runner.cjs'], ...mounts]) {
    if (from.includes(',') || to.includes(',')) throw Error('Unsupported comma in mount path');
    args.push('--mount', `type=bind,source=${from},target=${to},readonly`);
  }
  args.push(runtime.imageId, 'node', '/runner.cjs');
  return args;
}

function dependencyMounts(root, repo) {
  const deps = realpathSync(join(repo, 'node_modules'));
  if (deps !== join(repo, 'node_modules'))
    throw Error('Expected a local locked dependency installation');
  const result = [[deps, '/work/node_modules']];
  const sdkDeps = realpathSync(join(root, 'reference-repos/swagger-client/node_modules'));
  result.push([sdkDeps, sdkDeps]);
  const client = join(repo, 'node_modules/swagger-client');
  try {
    const target = realpathSync(client);
    if (target.startsWith(join(root, '.cache/sdk-artifacts') + sep)) result.push([target, target]);
    else if (!target.startsWith(deps + sep)) throw Error('Unexpected SDK link target');
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  return result;
}

export function runIsolatedProgram(
  root,
  repoId,
  program,
  { canonical = null, testDestination = null, timeout = 180000, dependencies = true } = {}
) {
  const runtime = isolationRuntime(root),
    manifest = JSON.parse(readFileSync(join(root, 'case.json')));
  const repo = manifest.repositories.find((r) => r.id === repoId);
  if (!repo) throw Error('Unknown isolated repository role');
  const original = join(root, repo.directory),
    name = 'crossrepo-check-' + randomUUID();
  const directory = join(root, '.cache/isolated-checks', name);
  mkdirSync(directory, { recursive: true });
  const source = join(directory, 'source'),
    snapshot = snapshotRepository(original, source);
  if (canonical) {
    const target = resolve(source, testDestination || '');
    if (!target.startsWith(source + sep) || !testDestination.startsWith('test/'))
      throw Error('Unsafe canonical destination');
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, canonical, { flag: 'wx', mode: 0o444 });
  }
  // runc cannot create a nested mountpoint inside an already read-only bind.
  if (dependencies) mkdirSync(join(source, 'node_modules'), { mode: 0o555 });
  const treeBefore = fingerprintPackage(source),
    entrypoint = join(directory, 'runner.cjs');
  writeFileSync(entrypoint, program, { flag: 'wx', mode: 0o444 });
  const args = containerArguments(
    runtime,
    name,
    source,
    entrypoint,
    dependencies ? dependencyMounts(root, original) : []
  );
  let child;
  try {
    child = spawnSync('docker', args, {
      encoding: 'utf8',
      timeout,
      maxBuffer: 16 * 1024 * 1024,
      killSignal: 'SIGTERM',
    });
  } finally {
    try {
      docker(['rm', '-f', name]);
    } catch {
      /* Only this randomly named owned container is cleaned up. */
    }
  }
  const treeAfter = fingerprintPackage(source);
  if (treeBefore !== treeAfter) throw Error('Read-only execution snapshot changed');
  const isolation = {
    version: 1,
    enforced: true,
    uid: process.getuid(),
    imageId: runtime.imageId,
    imageReference: runtime.imageReference,
    nodeVersion: runtime.nodeVersion,
    platform: runtime.platform,
    profileHash: runtime.profileHash,
    network: 'none',
    sourceReadOnly: true,
    dependencyMountsReadOnly: true,
    hostCredentialsMounted: false,
    hostEnvironmentForwarded: false,
    sourceSnapshotHash: treeBefore,
    sourceManifestHash: snapshot.manifestHash,
    canonicalHash: canonical ? digest(canonical) : null,
    scope: runtime.config.scope,
  };
  writeFileSync(
    join(directory, 'execution.json'),
    JSON.stringify({ container: name, exitCode: child.status, isolation }, null, 2) + '\n'
  );
  return { child, isolation, directory };
}

export function runIsolatedJest(root, repoId, testPath, canonical = null) {
  if (!/^test\/[A-Za-z0-9_./-]+\.jsx?$/.test(testPath) || testPath.split('/').includes('..'))
    throw Error('Unexpected Jest test path');
  const program = `const fs=require('node:fs');const {spawnSync}=require('node:child_process');
const c=spawnSync(process.execPath,['/work/node_modules/jest/bin/jest.js','--config','/work/config/jest/jest.unit.config.js','--runInBand','--watch=false','--no-cache','--cacheDirectory=/tmp/jest','--runTestsByPath',${JSON.stringify('/work/' + testPath)},'--json','--outputFile=/tmp/result.json'],{cwd:'/work',encoding:'utf8',timeout:160000,maxBuffer:12*1024*1024,env:process.env});
let report=null;try{const s=fs.lstatSync('/tmp/result.json');if(!s.isFile()||s.isSymbolicLink()||s.size>12*1024*1024)throw Error('Unsafe Jest output');report=JSON.parse(fs.readFileSync('/tmp/result.json','utf8'));}catch{}
process.stderr.write((c.stdout||'').slice(-1000000)+(c.stderr||'').slice(-1000000));
process.stdout.write(JSON.stringify({report,node:process.version,uid:process.getuid(),childError:c.error?.message||null}));process.exitCode=Number.isInteger(c.status)?c.status:70;`;
  const result = runIsolatedProgram(root, repoId, program, {
    canonical,
    testDestination: testPath,
  });
  let envelope;
  try {
    envelope = JSON.parse(result.child.stdout);
  } catch {
    envelope = null;
  }
  if (
    envelope &&
    (envelope.node !== result.isolation.nodeVersion ||
      envelope.uid !== result.isolation.uid ||
      envelope.uid === 0)
  )
    throw Error('Unexpected isolated runtime identity');
  return {
    ...result,
    report: envelope?.report || null,
    processError: envelope?.childError || result.child.error?.message || null,
  };
}
