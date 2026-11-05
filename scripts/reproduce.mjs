import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import {
  digest,
  fingerprintRepository,
  classifyJest,
  acceptanceMatches,
} from '../src/verification.mjs';
import { runIsolatedJest, isolationRuntime } from '../src/isolated-runtime.mjs';
import { canonicalNames, inventorySatisfied } from '../src/test-inventory.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const configurationBytes = readFileSync(join(root, 'case.json')),
  configuration = JSON.parse(configurationBytes);
const expectFailure = process.argv.includes('--expect-failure'),
  startedAt = new Date().toISOString();
if (Date.now() < Date.parse(configuration.buildWindow.start))
  throw Error('The event build window is not open');
// Mandatory preflight: no host Jest fallback when Docker/image is unavailable.
const runtime = isolationRuntime(root);
const runId = startedAt.replace(/[:.]/g, '-') + '-' + randomUUID().slice(0, 8),
  output = join(root, 'evidence/runs', runId);
mkdirSync(output, { recursive: true });
mkdirSync(join(root, '.cache'), { recursive: true });
const git = (directory, ...args) =>
  execFileSync('git', ['-C', directory, ...args], { encoding: 'utf8' }).trim();
const components = [];
for (const repository of configuration.repositories) {
  const directory = join(root, repository.directory),
    canonical = join(root, repository.acceptance),
    source = readFileSync(canonical);
  if (!acceptanceMatches(source, repository.acceptanceHash))
    throw Error('Acceptance differs from the pinned contract');
  const head = git(directory, 'rev-parse', 'HEAD');
  if (expectFailure && (head !== repository.commit || git(directory, 'status', '--porcelain')))
    throw Error('Refusing to label changed source as the original baseline');
  const before = fingerprintRepository(directory),
    runnerHash = digest(readFileSync(fileURLToPath(import.meta.url))),
    verifierHash = digest(readFileSync(join(root, 'src/verification.mjs')));
  const execution = runIsolatedJest(root, repository.id, repository.testDestination, source);
  const after = fingerprintRepository(directory),
    { report, child, isolation } = execution;
  writeFileSync(join(output, repository.id + '.jest.json'), JSON.stringify(report, null, 2) + '\n');
  writeFileSync(join(output, repository.id + '.stderr.log'), child.stderr || '');
  const inventoryComplete = inventorySatisfied(report, { names: canonicalNames[repository.id] });
  const integrity =
    before === after &&
    acceptanceMatches(readFileSync(canonical), repository.acceptanceHash) &&
    digest(configurationBytes) === digest(readFileSync(join(root, 'case.json'))) &&
    runnerHash === digest(readFileSync(fileURLToPath(import.meta.url))) &&
    verifierHash === digest(readFileSync(join(root, 'src/verification.mjs'))) &&
    runtime.profileHash === isolation.profileHash &&
    runtime.imageId === isolation.imageId &&
    isolation.canonicalHash === repository.acceptanceHash;
  const classification =
    integrity && inventoryComplete ? classifyJest(report, child.status) : 'integrity_error';
  const result = {
    id: repository.id,
    baseCommit: repository.commit,
    head,
    sourceFingerprint: before,
    sourceUnchangedDuringCheck: before === after,
    acceptanceHash: digest(source),
    runnerHash,
    verifierHash,
    isolation,
    inventoryComplete,
    exitCode: child.status,
    processError: execution.processError,
    classification,
    tests: report?.numTotalTests || 0,
    passed: report?.numPassedTests || 0,
    failed: report?.numFailedTests || 0,
    failures: (report?.testResults || []).flatMap((s) =>
      (s.assertionResults || []).filter((a) => a.status === 'failed').map((a) => a.fullName)
    ),
  };
  components.push(result);
  console.log(
    `${repository.id}: ${classification}; ${result.passed} passed, ${result.failed} failed (isolated ${isolation.nodeVersion})`
  );
}
const acceptancePassed =
  components.length === configuration.repositories.length &&
  components.every((r) => r.classification === 'passed');
const baselineReproduced =
  expectFailure &&
  components.length === configuration.repositories.length &&
  components.every((r) => r.classification === 'behavioural_failure');
const summary = {
  runId,
  startedAt,
  finishedAt: new Date().toISOString(),
  node: process.version,
  isolatedNode: runtime.nodeVersion,
  case: configuration.id,
  caseHash: digest(configurationBytes),
  mode: expectFailure ? 'baseline' : 'verify',
  coverage:
    'Canonical SDK/UI source checks in non-root no-network containers with read-only source/dependencies. Build/HTTP/browser stages remain separate trusted-host execution, not complete isolation.',
  acceptancePassed,
  baselineReproduced,
  expectedBehaviouralFailures: expectFailure,
  components,
};
writeFileSync(join(output, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
writeFileSync(
  join(root, '.cache/latest-verification.json'),
  JSON.stringify({ summary: join('evidence/runs', runId, 'summary.json') }) + '\n'
);
console.log(`Evidence: ${output}`);
process.exitCode = expectFailure ? (baselineReproduced ? 0 : 1) : acceptancePassed ? 0 : 1;
