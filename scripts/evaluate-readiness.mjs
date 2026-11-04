import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { digest, fingerprintRepository } from '../src/verification.mjs';
import { evaluateReadiness } from '../src/readiness.mjs';
import { runtimeArtifactMatches } from '../src/artifact-integrity.mjs';
import { browserEvidence } from '../src/browser-evidence.mjs';
import { currentApproval } from '../src/review.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => JSON.parse(readFileSync(join(root, name)));
const manifestBytes = readFileSync(join(root, 'case.json')),
  manifest = JSON.parse(manifestBytes);
const binding = read('evidence/runs/sdk-artifact-binding.json');
const summary = read(read('.cache/latest-verification.json').summary);
const ui = join(root, manifest.repositories.find((r) => r.id === 'ui').directory);
const sdk = join(root, manifest.repositories.find((r) => r.id === 'sdk').directory);
const runtimeBound = runtimeArtifactMatches({
  installed: join(ui, 'node_modules/swagger-client'),
  packageRoot: join(root, binding.packageRoot),
  dependencies: join(sdk, 'node_modules'),
  expectedFingerprint: binding.runtimeFingerprint,
});
const sources = Object.fromEntries(
  manifest.repositories.map((r) => [r.id, fingerprintRepository(join(root, r.directory))])
);
const browser = browserEvidence(root, sources, binding.artifactHash);
const policy = existsSync(join(root, '.secrets/review-policy.json'))
  ? read('.secrets/review-policy.json')
  : null;
const records = existsSync(join(root, 'evidence/runs/reviews.json'))
  ? read('evidence/runs/reviews.json')
  : [];
if (!Array.isArray(records)) throw Error('Invalid review ledger');
const current = {
  reviewPolicyHash: policy ? digest(JSON.stringify(policy)) : null,
  runtimeBound,
  browser,
  contractHash: digest(manifestBytes),
  sources,
  artifactHash: digest(readFileSync(join(root, binding.archive))),
  runnerHash: digest(readFileSync(join(root, 'scripts/reproduce.mjs'))),
  verifierHash: digest(readFileSync(join(root, 'src/verification.mjs'))),
  checkerHash: digest(
    Buffer.concat(
      [
        'src/readiness.mjs',
        'scripts/check-regressions.mjs',
        'scripts/evaluate-readiness.mjs',
        'src/artifact-integrity.mjs',
        'scripts/link-sdk.mjs',
        'src/browser-evidence.mjs',
        'src/review.mjs',
        'scripts/verifier.mjs',
      ].map((p) => readFileSync(join(root, p)))
    )
  ),
};
const result = {
  recordedAt: new Date().toISOString(),
  ...evaluateReadiness(
    summary,
    read('evidence/runs/linked-sdk-http.json'),
    read('evidence/runs/upstream-current.json'),
    current
  ),
  browser,
  limitations:
    'Source, artifact and scoped browser evidence; not a complete immutable environment, general browser compatibility proof or permission to merge/deploy/publish/submit.',
};
const approval = currentApproval(policy, result, records);
result.approved = !!approval;
result.review = {
  configured: !!policy,
  approved: !!approval,
  messageId: approval?.messageId || null,
  scope: 'Local tested bundle review only; no production or public action',
};
if (approval) result.reason = 'checks_pass_human_review_recorded';
writeFileSync(join(root, 'evidence/runs/readiness.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
process.exitCode = result.readyForHumanReview ? 0 : 1;
