# Historical Swagger reference case

## Provenance

This exercises a behavioural task across Swagger's request-building library and UI consumer. The reference fixes already existed upstream. Do not call this a newly discovered open issue, accepted upstream contribution, blind model evaluation or original WideSWE execution.

- Paper: https://arxiv.org/html/2609.33382v1
- Historical task metadata: https://github.com/ZJU-ACES-ISE/WideSWE/blob/main/cases/swagger-api/swagger_api_swagger_js_swagger_ui_f6dabca1247a/task.yaml
- SDK fix: https://github.com/swagger-api/swagger-client/pull/3826
- UI fix: https://github.com/swagger-api/swagger-ui/pull/10713

No WideSWE harness/tests were copied or run. Its harness license was not established; the paper's license is not assumed to cover code.

## Executed adapted pair

| Side | Version | Declared original revision |
|---|---|---|
| swagger-client (formerly swagger-js) | 3.34.2 | `5a4f9a335b7fd56a58f00339d6f689fcfa78d700` |
| swagger-ui | 5.20.0 | `55dca4c69d4192c8b4616513afdc087f40364048` |

The original benchmark UI revision was `f63d8504997cca6172599022211c3e7315069afa`, version 5.31.0, requiring SDK `^3.36.1`. It is not this execution pair. The selected UI 5.20.0 declares `^3.34.1`, which includes SDK 3.34.2 and retains the relevant validation path. This is explicitly an **adapted historical replay**.

## Actual execution

The clean original pair reproduced four SDK and one UI independent source failures while its selected upstream suites were green. Actual HTTP reproduced the encoded array arriving as one string instead of repeated query values.

The exported patches repair the SDK and UI. Original acceptance file hashes remain pinned and unchanged. Real Chrome tests additionally exposed a nullable-array editor validation gap; the UI patch and an added regression cover that narrow case. One inherited assertion was tightened for OAS3 while retaining Swagger 2 compatibility.

The four-state browser matrix uses newly extracted declared base-revision sources. Original SDK dependencies must match the frozen lockfile; original SDK modules are selected with an explicit test-only Webpack alias, not by silently retargeting live dependencies. Actual ES execute paths/content are recorded. See BROWSER.md and the reproduction commands in README.md.

Recorded coverage: 12 independent cases, 3 actual HTTP cases, 173 selected upstream tests and 20 browser outcomes including five expected broken-state observations. Only both-fixed satisfies all five candidate browser scenarios. This is one useful case, not a general performance claim.

## Rights and platform limits

Both upstream base repositories report Apache-2.0. Full texts are retained under `LICENSES/` in the public snapshot (and `reference/licenses/` in the development archive); applicable notices must be preserved. Dependencies are installed, not vendored into this repository.

Executed platform: macOS/Apple silicon, Node 22.14.0 and installed Chrome 156.0.8078.80. Fresh exported-checkout installation and full checks were rehearsed on that same host with package-cache reuse. This is not a fresh-OS or original linux/amd64 benchmark environment. It does not require downloading full benchmark images or Cypress binaries.
