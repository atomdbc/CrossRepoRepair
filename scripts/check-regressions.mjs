import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { fingerprintRepository, classifyJest } from '../src/verification.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(join(root, 'case.json')));
const startedAt = new Date().toISOString();
const runId = `regressions-${startedAt.replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;
const output = join(root, 'evidence/runs', runId);
mkdirSync(output, { recursive: true });
const suites = { sdk: 'test/oas3/execute/style-explode/query.js', ui: 'test/unit/core/utils.js' };
const components = [];
for (const repo of manifest.repositories) {
  const cwd = join(root, repo.directory), before = fingerprintRepository(cwd);
  const reportPath = join(output, `${repo.id}.json`);
  const child = spawnSync(process.execPath, [join(cwd, 'node_modules/jest/bin/jest.js'), '--config',
    'config/jest/jest.unit.config.js', '--runInBand', '--runTestsByPath', suites[repo.id], '--json', '--outputFile', reportPath], {
    cwd, encoding: 'utf8', timeout: 180000, maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, BABEL_ENV: 'commonjs', NODE_ENV: 'test', BROWSERSLIST_ENV: 'node-development' },
  });
  writeFileSync(join(output, `${repo.id}.log`), (child.stdout || '') + (child.stderr || ''));
  let report; try { report = JSON.parse(readFileSync(reportPath)); } catch { report = null; }
  const classification = before === fingerprintRepository(cwd) ? classifyJest(report, child.status) : 'integrity_error';
  components.push({ id: repo.id, suite: suites[repo.id], sourceFingerprint: before, classification,
    passed: report?.numPassedTests || 0, failed: report?.numFailedTests || 0, tests: report?.numTotalTests || 0 });
}
const result = { runId, startedAt, finishedAt: new Date().toISOString(),
  allPassed: components.length === 2 && components.every(c => c.classification === 'passed'), components,
  note: 'Targeted upstream suites, not complete test inventories. The OAS3 array-string expectation is intentionally stricter while Swagger 2 compatibility is retained.' };
writeFileSync(join(output, 'summary.json'), JSON.stringify(result, null, 2) + '\n');
writeFileSync(join(root, 'evidence/runs/upstream-current.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
process.exitCode = result.allPassed ? 0 : 1;
