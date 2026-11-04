# CrossRepoRepair

**One green repository is not a completed change.**

CrossRepoRepair is a working Switch-coordinated repair workflow: a coding assistant takes two repository roles, an independent deterministic verifier checks the combined behaviour, and a person reviews the exact tested bundle. A chat claim cannot replace runner evidence; changed source, artifacts or browser evidence cannot inherit an old approval.

Built for **Flip the Switch 2026 — Best Business Workflow**. This repository is a public development snapshot, **not a submitted entry or production deployment**.

## What actually works

- Real Switch room, coding-session transport and WebSocket verifier—not a mocked chat screen.
- Both Swagger SDK/UI patches, with the original failing baseline retained.
- **12 independent source acceptance checks**, **3 actual HTTP cases**, **173 selected upstream tests** and **33 own unit tests** passing in the recorded run.
- **20 real Chrome matrix outcomes**: neither fixed, SDK-only, UI-only, both fixed. Five outcomes deliberately reproduce broken states; only both-fixed satisfies all five candidate scenarios.
- A genuine local human approval was accepted for an exact bundle. A real coding-agent approval attempt was denied. Controlled source drift made the human receipt non-current; exact restoration recovered the same receipt.

**Actor attribution:** one existing AI coding session performed the two repository roles sequentially. The verifier is deterministic, not another model. Separate Codex CLI attempts failed and made no edits. There is no claim of independent model-worker success or a measured multi-agent advantage.

## Historical case, not a new upstream fix

| Component | Base | Revision |
|---|---|---|
| swagger-client | 3.34.2 | `5a4f9a335b7fd56a58f00339d6f689fcfa78d700` |
| swagger-ui | 5.20.0 | `55dca4c69d4192c8b4616513afdc087f40364048` |

The SDK must decode JSON array text under array-capable schemas without coercing string-only values. The UI must reject invalid array input visibly instead of leaving a loader running. Actual browser testing also exposed a nullable-array editor validation gap, covered by the additional UI patch.

Original upstream fixes already exist: [SDK #3826](https://github.com/swagger-api/swagger-client/pull/3826), [UI #10713](https://github.com/swagger-api/swagger-ui/pull/10713). This is an **adapted historical replay**, not a current open bug, accepted upstream contribution, original WideSWE environment or broad benchmark result.

## Reproduce locally

Tested on **macOS/Apple silicon**, Node **22.14.0**, with already-installed **Chrome 156.0.8078.80**. Node 22+, Git, npm and POSIX tools are required. The browser command does not download Chrome; set `CHROME_PATH` for another installed executable. Cross-platform/cross-browser support is not established.

Allow several minutes for public dependency installation and builds. Bootstrap refuses to continue below 8 GiB free. It disables lifecycle scripts and incidental Cypress downloads, and does not start Switch or models.

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run bootstrap
npm test

# Clean original state: success means the expected bugs were reproduced.
npm run baseline
npm run link-sdk
npm run http:baseline

# Apply both recorded source repairs, retaining original lockfiles.
git -C reference-repos/swagger-client apply ../../patches/swagger-client.patch
git -C reference-repos/swagger-ui apply ../../patches/swagger-ui.patch

npm run verify
npm run link-sdk
npm run http:verify
npm run regressions
npm run browser:build
npm run browser:verify
npm run readiness
```

The last command should produce a **new local reviewable bundle, not an approved one**. Original private keys/reviewer policy are intentionally absent. Source/artifact/build/checker identities are local to your run; do not reuse a recorded approval as authority for your checkout.

Targeted upstream tests are not the complete upstream inventories. One inherited UI assertion was tightened for OAS3 while preserving Swagger 2, and a nullable-array regression was added. Original acceptance file hashes remain pinned in `case.json`.

A fresh exported checkout completed this full sequence on the same Mac on **4 November 2026**: all 15 commands passed, with package-cache reuse, no private keys/policy copied and an unapproved new local bundle. See `evidence/recorded/clean-reproduction.json`. This is not a fresh-OS or independently reprovisioned Switch-installation claim.

## Run the Switch workflow

Use your own compatible Switch deployment (recorded: Console 0.40.1, native server 0.31.0, Mattermost 11.9.0).

1. Create your local room and registration key in the owner's Console.
2. Copy `switch.local.example.json` to ignored `switch.local.json`; use your actual URL/room ID.
3. Set `SWITCH_URL` and `SWITCH_REGISTRATION_KEY`, then run `npm run switch:register` and `npm run session:register`. Invite both agents to the room through the owner Console. Keep generated credentials private.
4. Configure addressing for the owner and owner's agents in that room. Run `npm run switch:listen` once; do not start competing verifier clients.
5. Give your existing coding assistant these room tools:

```sh
npm run session:context
printf '%s\n' '@crossrepo-verifier check' | npm run session:post
```

The actual `check` request drives SDK build/linking, independent source acceptance, HTTP capture, upstream regressions, browser build/matrix and readiness. `status` checks freshness without calling a model. Literal commands never become shell input.

For human review, the trusted operator explicitly enrolls an actual confirmed person's **server-origin opaque sender**, room and authorised contract hashes in ignored `.secrets/review-policy.json`, following `review-policy.example.json`. Do not auto-enroll by display name or a message claiming to be human. Missing policy denies review. The enrolled person—not a bot—may send `@crossrepo-verifier approve <full-current-bundle-hash>` after reviewing it. The receipt grants **local bundle review only**, never deployment, publication, spending or submission.

## Evidence and demo

`evidence/recorded/` contains selected sanitised historical receipts and actual browser screenshots. Its manifest lists original and published digests. These records are **not current runtime inputs**; a fresh run writes its own `evidence/runs/`. Redactions may change JSON bytes, so original embedded digest relationships must not be presented as verification of redacted files.

See `docs/BROWSER.md`, `docs/ACCEPTANCE.md`, `docs/REFERENCE_CASE.md`, `docs/REPRODUCTION.md` and `docs/SECURITY.md`.

Demo video: being prepared. Do not mistake screenshots or planned recording for a published video.

## Boundaries

- No production/customer data, live customer system or funds.
- No auto-merge, deployment or hackathon submission actuator.
- **Complete worker isolation/immutable dependency environments are not implemented.** Current receipts trust the Switch server and local verifier/storage; they do not secure a privileged/compromised host. The historical repair was not retroactively sandboxed.
- Browser coverage is the declared desktop scenarios, not arbitrary schema unions. Seven seconds of observed loading is not proof of infinite duration.
- No invented customers, saved-hours metrics, broad benchmark improvement or winning odds. Pact/PactFlow and other multi-repo tools already exist; the contribution here is the demonstrated Switch workflow and exact-bundle evidence, not invention of those categories.

## Licensing

Original CrossRepoRepair code has **no additional project-wide license selected yet**; public visibility alone is not a new permissive license grant. Swagger-derived patches/source context are Apache-2.0; full notices are retained under `LICENSES/` and `NOTICE.md`. Dependencies are installed separately under their own licenses. A project-wide license decision remains for the owner before final distribution/submission preparation.
