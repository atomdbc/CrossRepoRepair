# Browser verification — 4 November 2026

## Actual result

Installed **Chrome 156.0.8078.80**, isolated headless profile, 1280×1000 desktop viewport. No browser download or signed-in user profile was used. CDP mouse events operate Execute; text-entry events fill the nullable-array textarea. A real loopback HTTP server captures the requests.

The full matrix has **20 verified outcomes**: five scenarios in four repair states. Five outcomes deliberately reproduce broken partial/unfixed behaviour. This does **not** mean the unfixed variants satisfy acceptance. Only **both-fixed** satisfies all five candidate scenarios.

| State | Observed failures |
|---|---|
| Neither fixed | Invalid supplied array is not visibly rejected; required nullable-array input is incorrectly reported missing |
| SDK only | Invalid array leaves a visible loader throughout seven seconds, with no HTTP; nullable-array input is incorrectly reported missing |
| UI only | The encoded array reaches HTTP as one JSON string, not repeated `a`, `b` values |
| Both fixed | Invalid and missing arrays show visible errors without loading/request; native array and encoded nullable-array produce repeated `a`, `b`; string-only JSON-looking input stays one string |

The nullable-array DOM case exposed an additional consumer gap beyond the first source checks. The UI now validates decoded JSON arrays locally for **array/null type lists**, without changing the stored wire string or string-only schemas. An additional upstream unit test covers valid, malformed, missing and null values. The original pinned acceptance files were not edited.

## Reproduce

After the SDK is built/linked and source checks pass:

```sh
npm run browser:build
npm run browser:verify
npm run readiness
```

`CHROME_PATH` can select an already-installed Chrome binary. The default is the installed macOS Google Chrome path. No automatic download occurs. Cross-browser/mobile/platform compatibility is not claimed.

`@crossrepo-verifier check` now runs browser build/checks after source, actual HTTP and targeted upstream regressions. Missing, stale or failing browser evidence blocks review readiness. `status` revalidates fingerprints without starting another model or browser test.

## Identity and snapshots

- Original UI and SDK sources are freshly extracted from the **declared base revisions**, not reused edited working trees.
- The original SDK is compiled using the matching locked dependency installation. Changed lockfiles require a separate baseline installation rather than silently sharing different dependencies.
- Test-only Webpack aliases select the original SDK for neither-fixed/UI-only. Live UI dependency links are **not** retargeted.
- Webpack module graphs record the actual ES execute module and its content identity for each variant.
- The candidate uses the content-identified repaired SDK artifact.
- Bundle, stylesheet, screenshot, contract and harness hashes are checked and bound to the review identity.

These are consistent snapshots/fingerprints, not a complete hermetic environment or protection against a privileged host attacker.

## Evidence

- `browser-contract.json` — version 2, additive four-way matrix; original SDK/UI contract remains version 1.
- `evidence/runs/browser-build.json` — source/base revisions, SDK module paths/hashes and built bundle identities.
- `evidence/runs/browser-observations.json` — actual parameter-state values, DOM observations, network requests, browser version and classifications.
- `evidence/runs/browser-<state>-<scenario>.png` — actual browser screenshots, hashed in the observations.
- `evidence/runs/browser-evidence-drift-probe.json` — changed stylesheet bytes reject prior readiness despite unchanged source/SDK archive; exact restoration restores it.
- `evidence/runs/browser-v1-*.json` — earlier two-state result retained before extending the matrix.

Seven seconds of observed loading is not proof of infinite duration. Coverage is limited to these declared scenarios, including a nullable-array union—not arbitrary JSON Schema unions. Automated browser events are **not** a genuine human Switch message or approval. Genuine exact-bundle local human approval is now recorded separately; nothing is merged, deployed, published or submitted.
