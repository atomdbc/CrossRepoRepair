import { digest } from './verification.mjs';

export function evaluateReadiness(summary, network, regressions, current) {
  const ids = ['sdk', 'ui'];
  const components = summary?.components || [],
    upstream = regressions?.components || [];
  const complete = (rows) =>
    rows.length === 2 && ids.every((id) => rows.filter((r) => r.id === id).length === 1);
  const isolated = (rows) =>
    rows.every(
      (r) =>
        r.inventoryComplete === true &&
        r.isolation?.enforced === true &&
        r.isolation.imageId === current.isolationRuntime?.imageId &&
        r.isolation.profileHash === current.isolationRuntime?.profileHash &&
        r.isolation.network === 'none' &&
        r.isolation.sourceReadOnly === true &&
        r.isolation.dependencyMountsReadOnly === true &&
        r.isolation.hostCredentialsMounted === false &&
        r.isolation.hostEnvironmentForwarded === false &&
        Number.isInteger(r.isolation.uid) &&
        r.isolation.uid > 0
    );
  const fresh =
    current.isolationRuntime?.available === true &&
    current.isolationRuntime.probePassed === true &&
    isolated(components) &&
    isolated(upstream) &&
    current.browser?.fresh === true &&
    current.runtimeBound === true &&
    complete(components) &&
    complete(upstream) &&
    summary.caseHash === current.contractHash &&
    components.every(
      (r) =>
        r.sourceFingerprint === current.sources[r.id] &&
        r.sourceUnchangedDuringCheck === true &&
        r.runnerHash === current.runnerHash &&
        r.verifierHash === current.verifierHash
    ) &&
    upstream.every((r) => r.sourceFingerprint === current.sources[r.id]) &&
    network?.sdkSourceFingerprint === current.sources.sdk &&
    network?.artifactHash === current.artifactHash;
  const checksPassed =
    fresh &&
    current.browser.allPassed === true &&
    summary.acceptancePassed === true &&
    network.acceptancePassed === true &&
    network.passed >= 3 &&
    network.failed === 0 &&
    regressions.allPassed === true &&
    components.every((r) => r.classification === 'passed' && r.tests > 0 && r.failed === 0) &&
    upstream.every((r) => r.classification === 'passed' && r.tests > 0 && r.failed === 0);
  const bundleId = digest(
    JSON.stringify({
      contractHash: current.contractHash,
      sources: { sdk: current.sources.sdk, ui: current.sources.ui },
      artifactHash: current.artifactHash,
      runnerHash: current.runnerHash,
      verifierHash: current.verifierHash,
      checkerHash: current.checkerHash,
      browserIdentityHash: current.browser?.identityHash,
      reviewPolicyHash: current.reviewPolicyHash,
      isolationIdentity: current.isolationRuntime?.identityHash,
      readinessVersion: 4,
    })
  );
  return {
    bundleId,
    readyForHumanReview: !!checksPassed,
    fresh: !!fresh,
    reason: !fresh
      ? 'stale_or_missing_evidence'
      : checksPassed
        ? 'checks_pass_review_required'
        : 'required_checks_failed',
    contractHash: current.contractHash,
    sources: current.sources,
    artifactHash: current.artifactHash,
    approved: false,
    deploymentPerformed: false,
  };
}
