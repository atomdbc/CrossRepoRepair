import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateReadiness } from '../src/readiness.mjs';
function fixture() {
  const current = {
    browser: { fresh: true, allPassed: true, identityHash: 'browser' },
    runtimeBound: true,
    contractHash: 'contract',
    sources: { sdk: 'sdk-source', ui: 'ui-source' },
    artifactHash: 'artifact',
    runnerHash: 'runner',
    verifierHash: 'verifier',
  };
  const components = ['sdk', 'ui'].map((id) => ({
    id,
    sourceFingerprint: current.sources[id],
    sourceUnchangedDuringCheck: true,
    runnerHash: 'runner',
    verifierHash: 'verifier',
    classification: 'passed',
    tests: 3,
    failed: 0,
  }));
  return {
    current,
    summary: { caseHash: 'contract', acceptancePassed: true, components },
    network: {
      sdkSourceFingerprint: 'sdk-source',
      artifactHash: 'artifact',
      acceptancePassed: true,
      passed: 3,
      failed: 0,
    },
    regressions: { allPassed: true, components: structuredClone(components) },
  };
}
const evaluate = (f) => evaluateReadiness(f.summary, f.network, f.regressions, f.current);
test('passing complete evidence creates a review bundle, never automatic approval', () => {
  const r = evaluate(fixture());
  assert.equal(r.readyForHumanReview, true);
  assert.equal(r.approved, false);
});
test('a changed repository invalidates evidence and the old bundle ID', () => {
  const f = fixture(),
    old = evaluate(f);
  f.current.sources.ui = 'changed';
  const r = evaluate(f);
  assert.equal(r.readyForHumanReview, false);
  assert.notEqual(r.bundleId, old.bundleId);
});
test('one green repository cannot hide another failure', () => {
  const f = fixture();
  f.summary.components[1].failed = 1;
  f.summary.components[1].classification = 'behavioural_failure';
  assert.equal(evaluate(f).readyForHumanReview, false);
});
test('upstream regressions, wire failures and stale browser evidence block readiness', () => {
  let f = fixture();
  f.regressions.allPassed = false;
  assert.equal(evaluate(f).readyForHumanReview, false);
  f = fixture();
  f.network.failed = 1;
  assert.equal(evaluate(f).readyForHumanReview, false);
  f = fixture();
  f.current.browser.fresh = false;
  assert.equal(evaluate(f).readyForHumanReview, false);
});
test('missing/duplicate components fail closed', () => {
  const f = fixture();
  f.summary.components = [f.summary.components[0], f.summary.components[0]];
  assert.equal(evaluate(f).readyForHumanReview, false);
});
