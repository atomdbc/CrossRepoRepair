import { spawnSync, execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { digest, fingerprintRepository, classifyJest, acceptanceMatches } from '../src/verification.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const configurationBytes = readFileSync(join(root, 'case.json'));
const configuration = JSON.parse(configurationBytes);
const expectFailure = process.argv.includes('--expect-failure');
const startedAt = new Date().toISOString();
if (Date.now() < Date.parse(configuration.buildWindow.start)) throw new Error('The event build window is not open.');
const runId = startedAt.replace(/[:.]/g, '-') + '-' + randomUUID().slice(0, 8);
const output = join(root, 'evidence', 'runs', runId);
mkdirSync(output, { recursive: true });
const git = (directory, ...args) => execFileSync('git', ['-C', directory, ...args], { encoding: 'utf8' }).trim();
const components = [];

for (const repository of configuration.repositories) {
  const directory = join(root, repository.directory);
  const canonical = join(root, repository.acceptance);
  const destination = join(directory, repository.testDestination);
  const reportPath = join(output, repository.id + '.jest.json');
  const source = readFileSync(canonical);
  if (!acceptanceMatches(source, repository.acceptanceHash)) throw new Error('Acceptance content differs from the pinned contract. Refusing to run weakened checks.');
  const head = git(directory, 'rev-parse', 'HEAD');
  if (expectFailure && (head !== repository.commit || git(directory, 'status', '--porcelain'))) {
    throw new Error(`Refusing to label a changed ${repository.id} working tree as the original baseline.`);
  }
  const before = fingerprintRepository(directory);
  const runnerHash = digest(readFileSync(fileURLToPath(import.meta.url)));
  const verifierHash = digest(readFileSync(join(root, 'src/verification.mjs')));
  const jestPath = join(directory, 'node_modules', 'jest', 'bin', 'jest.js');
  if (!existsSync(jestPath)) throw new Error('Dependencies missing; run npm run bootstrap with installation permission.');
  if (existsSync(destination)) throw new Error(`Refusing to overwrite existing acceptance destination: ${destination}`);
  writeFileSync(destination, source, { flag: 'wx' });
  let child;
  let unchangedAcceptance = false;
  try {
    const args = [jestPath, '--config', 'config/jest/jest.unit.config.js', '--runInBand',
      '--watch=false', '--no-cache', '--runTestsByPath', destination, '--json', '--outputFile', reportPath];
    child = spawnSync(process.execPath, args, {
      cwd: directory,
      env: { ...process.env, PATH: dirname(process.execPath) + ':' + process.env.PATH,
        CI: 'true', BABEL_ENV: 'commonjs', NODE_ENV: 'test',
        BROWSERSLIST_ENV: 'node-development', SCARF_ANALYTICS: 'false', HUSKY: '0' },
      encoding: 'utf8', timeout: 180000, maxBuffer: 16 * 1024 * 1024,
    });
    unchangedAcceptance = existsSync(destination) && digest(readFileSync(destination)) === digest(source) &&
      digest(readFileSync(canonical)) === digest(source);
  } finally {
    // Delete only the unchanged temporary copy created by this run.
    if (existsSync(destination) && digest(readFileSync(destination)) === digest(source)) unlinkSync(destination);
  }
  writeFileSync(join(output, repository.id + '.stdout.log'), child.stdout || '');
  writeFileSync(join(output, repository.id + '.stderr.log'), child.stderr || '');
  let report;
  try { report = JSON.parse(readFileSync(reportPath, 'utf8')); } catch { report = null; }
  const after = fingerprintRepository(directory);
  const integrity = unchangedAcceptance && before === after &&
    runnerHash === digest(readFileSync(fileURLToPath(import.meta.url))) &&
    verifierHash === digest(readFileSync(join(root, 'src/verification.mjs'))) &&
    digest(configurationBytes) === digest(readFileSync(join(root, 'case.json')));
  const classification = integrity ? classifyJest(report, child.status) : 'integrity_error';
  const result = {
    id: repository.id, baseCommit: repository.commit, head, sourceFingerprint: before,
    sourceUnchangedDuringCheck: before === after, acceptanceHash: digest(source), runnerHash, verifierHash,
    exitCode: child.status, processError: child.error?.message || null,
    classification, tests: report?.numTotalTests ?? 0, passed: report?.numPassedTests ?? 0,
    failed: report?.numFailedTests ?? 0,
    failures: (report?.testResults || []).flatMap((suite) => (suite.assertionResults || [])
      .filter((item) => item.status === 'failed').map((item) => item.fullName)),
  };
  components.push(result);
  console.log(`${repository.id}: ${classification}; ${result.passed} passed, ${result.failed} failed (${result.tests} assertions)`);
}

const acceptancePassed = components.length === configuration.repositories.length && components.every((r) => r.classification === 'passed');
const baselineReproduced = expectFailure && components.length === configuration.repositories.length &&
  components.every((r) => r.classification === 'behavioural_failure');
const summary = {
  runId, startedAt, finishedAt: new Date().toISOString(), node: process.version,
  case: configuration.id, caseHash: digest(configurationBytes), mode: expectFailure ? 'baseline' : 'verify',
  coverage: 'Actual source-level SDK builder and UI validation checks; NOT linked UI artifacts, HTTP capture, browser loader, Switch workflow or isolation proof.',
  acceptancePassed, baselineReproduced, expectedBehaviouralFailures: expectFailure,
  components,
};
writeFileSync(join(output, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
writeFileSync(join(root, '.cache', 'latest-verification.json'), JSON.stringify({ summary: join('evidence', 'runs', runId, 'summary.json') }) + '\n');
console.log(`Evidence: ${output}`);
console.log(baselineReproduced ? 'Original baseline failures reproduced; acceptance is NOT passing.' : `Acceptance passed: ${acceptancePassed}`);
process.exitCode = expectFailure ? (baselineReproduced ? 0 : 1) : (acceptancePassed ? 0 : 1);
