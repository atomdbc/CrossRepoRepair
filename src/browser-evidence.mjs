import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { digest } from './verification.mjs';
import { classifyBrowserObservation } from './browser-verification.mjs';
export const browserHarnessFiles = [
  'scripts/check-browser.mjs',
  'scripts/browser-fixture.mjs',
  'src/cdp.mjs',
  'src/browser-verification.mjs',
];
export function browserEvidence(root, sources, artifactHash) {
  try {
    const read = (p) => readFileSync(join(root, p));
    const report = JSON.parse(read('evidence/runs/browser-observations.json'));
    const buildBytes = read('evidence/runs/browser-build.json'),
      build = JSON.parse(buildBytes);
    const contractBytes = read('browser-contract.json'),
      contract = JSON.parse(contractBytes);
    const contractHash = digest(contractBytes),
      harnessHash = digest(Buffer.concat(browserHarnessFiles.map(read)));
    const buildScriptHash = digest(read('scripts/build-browser.mjs'));
    const bundles = Object.fromEntries(
      build.outputs.map((o) => [o.variant, digest(read(join(o.directory, 'swagger-ui.js')))])
    );
    const styleHash = digest(read('.cache/browser/swagger-ui.css'));
    const identityHash = digest(
      JSON.stringify({ contractHash, harnessHash, buildScriptHash, bundles, styleHash })
    );
    const fresh =
      build.caseHash === digest(read('case.json')) &&
      report.sourceFingerprints.sdk === sources.sdk &&
      report.sourceFingerprints.ui === sources.ui &&
      build.sdkSourceFingerprint === sources.sdk &&
      build.uiSourceFingerprint === sources.ui &&
      report.artifactHash === artifactHash &&
      build.artifactHash === artifactHash &&
      report.contractHash === contractHash &&
      report.harnessHash === harnessHash &&
      report.buildReportHash === digest(buildBytes) &&
      build.buildScriptHash === buildScriptHash &&
      build.styleHash === styleHash &&
      build.outputs.length === contract.variants.length &&
      contract.variants.every((v) =>
        build.outputs.some((o) => o.variant === v && o.bundleHash === bundles[v])
      );
    const complete =
      report.results.length === contract.variants.length * contract.modes.length &&
      contract.variants.every((v) =>
        contract.modes.every(
          (m) => report.results.filter((r) => r.variant === v && r.mode === m).length === 1
        )
      );
    const screenshotsMatch = report.results.every(
      (r) =>
        r.screenshotPath === `evidence/runs/browser-${r.variant}-${r.mode}.png` &&
        r.screenshotHash === digest(read(r.screenshotPath))
    );
    const allPassed =
      fresh &&
      complete &&
      screenshotsMatch &&
      report.results.every((r) => classifyBrowserObservation(r).passed);
    return {
      fresh: !!fresh,
      allPassed: !!allPassed,
      identityHash,
      contractHash,
      harnessHash,
      checks: report.results.length,
      limitations: contract.limits,
    };
  } catch {
    return {
      fresh: false,
      allPassed: false,
      identityHash: null,
      reason: 'missing_or_unreadable_browser_evidence',
    };
  }
}
