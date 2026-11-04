import { spawnSync, execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync, statfsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(readFileSync(join(root, 'case.json')));
if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('Node 22 or later is required.');
if (Date.now() < Date.parse(config.buildWindow.start)) throw new Error('Do not implement/setup the event workflow before the build window.');
const cache = join(root, '.cache');
mkdirSync(cache, { recursive: true });
mkdirSync(join(root, 'reference-repos'), { recursive: true });
for (const name of ['npm-user.npmrc', 'npm-global.npmrc']) {
  const path = join(cache, name);
  if (!existsSync(path)) writeFileSync(path, '', { flag: 'wx' });
  if (readFileSync(path, 'utf8') !== '') throw new Error('Expected an empty project-local npm config, not credentials.');
}
const checkDisk = () => {
  const disk = statfsSync(root);
  if (disk.bavail * disk.bsize < 8 * 1024 ** 3) throw new Error('Less than 8 GiB free. Stop; do not delete unrelated data.');
};
const run = (command, args, cwd = root, env = process.env) => {
  const child = spawnSync(command, args, { cwd, env, stdio: 'inherit' });
  if (child.error) throw child.error;
  if (child.status !== 0) throw new Error(`${command} failed with status ${child.status}`);
};
for (const repo of config.repositories) {
  checkDisk();
  const path = join(root, repo.directory);
  if (!existsSync(path)) {
    run('git', ['-c', 'init.defaultBranch=main', 'init', path]);
    run('git', ['remote', 'add', 'origin', repo.url], path);
    run('git', ['fetch', '--depth=1', 'origin', repo.commit], path);
    run('git', ['checkout', '--detach', 'FETCH_HEAD'], path);
  } else {
    const origin = execFileSync('git', ['-C', path, 'remote', 'get-url', 'origin'], { encoding: 'utf8' }).trim();
    if (origin !== repo.url) throw new Error('Unexpected existing repository origin. Not changing it.');
    run('git', ['merge-base', '--is-ancestor', repo.commit, 'HEAD'], path);
  }
  run(join(dirname(process.execPath), 'npm'), [
    'ci', '--ignore-scripts', '--no-audit', '--no-fund', '--registry=https://registry.npmjs.org',
    `--userconfig=${join(cache, 'npm-user.npmrc')}`, `--globalconfig=${join(cache, 'npm-global.npmrc')}`,
    `--cache=${join(cache, 'npm')}`,
  ], path, { ...process.env, PATH: dirname(process.execPath) + ':' + process.env.PATH,
    CYPRESS_INSTALL_BINARY: '0', HUSKY: '0', SCARF_ANALYTICS: 'false' });
  checkDisk();
}
console.log('Pinned source/dependencies installed. No Switch services or models started. Run npm run baseline.');
