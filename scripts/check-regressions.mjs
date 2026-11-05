import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { fingerprintRepository, classifyJest } from '../src/verification.mjs';
import { runIsolatedJest, isolationRuntime } from '../src/isolated-runtime.mjs';
import { inventorySatisfied, minimumRegressions } from '../src/test-inventory.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(join(root, 'case.json'))),
  runtime = isolationRuntime(root),
  startedAt = new Date().toISOString();
const runId = `regressions-${startedAt.replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`,
  output = join(root, 'evidence/runs', runId);
mkdirSync(output, { recursive: true });
const suites = { sdk: 'test/oas3/execute/style-explode/query.js', ui: 'test/unit/core/utils.js' },
  components = [];
for (const repo of manifest.repositories) {
  const cwd = join(root, repo.directory),
    before = fingerprintRepository(cwd);
  const execution = runIsolatedJest(root, repo.id, suites[repo.id]),
    { report, child, isolation } = execution;
  writeFileSync(join(output, repo.id + '.json'), JSON.stringify(report, null, 2) + '\n');
  writeFileSync(join(output, repo.id + '.log'), child.stderr || '');
  const inventoryComplete = inventorySatisfied(report, { minimum: minimumRegressions[repo.id] });
  const integrity =
    before === fingerprintRepository(cwd) &&
    isolation.profileHash === runtime.profileHash &&
    isolation.imageId === runtime.imageId;
  const classification =
    integrity && inventoryComplete ? classifyJest(report, child.status) : 'integrity_error';
  components.push({
    id: repo.id,
    suite: suites[repo.id],
    sourceFingerprint: before,
    isolation,
    inventoryComplete,
    classification,
    passed: report?.numPassedTests || 0,
    failed: report?.numFailedTests || 0,
    tests: report?.numTotalTests || 0,
  });
}
const result = {
  runId,
  startedAt,
  finishedAt: new Date().toISOString(),
  allPassed: components.length === 2 && components.every((c) => c.classification === 'passed'),
  components,
  note: 'Targeted upstream suites in non-root read-only/no-network containers, not complete inventories or build/browser isolation. OAS3 expectation strengthened while Swagger 2 retained; nullable-array case added.',
};
writeFileSync(join(output, 'summary.json'), JSON.stringify(result, null, 2) + '\n');
writeFileSync(
  join(root, 'evidence/runs/upstream-current.json'),
  JSON.stringify(result, null, 2) + '\n'
);
console.log(JSON.stringify(result, null, 2));
process.exitCode = result.allPassed ? 0 : 1;
