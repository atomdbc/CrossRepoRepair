# Reproduction

Follow the complete command sequence in README.md on a fresh checkout. Do not copy another run's `.cache`, `.secrets`, local configuration or approval ledger.

`baseline` and `http:baseline` succeed only when the expected original bugs reproduce; they are not passing acceptance. Apply both exported patches only after that baseline. The normal source, HTTP, upstream and browser commands then check the candidate.

Browser matrix expectations are in browser-contract.json: 20 outcomes include five expected broken-state observations, not 20 healthy states. Only both-fixed satisfies all five candidate scenarios. Original fixtures use declared base revisions, matching lockfiles and test-only SDK aliases; no live dependency link is retargeted for partial states.

A new clone should finish with a new **unapproved** local review bundle. A genuine reviewer must be enrolled on that deployment and approve its exact current ID. Historical receipts under evidence/recorded are not runtime authority.

Platform recorded so far: macOS/Apple silicon, Node 22.14.0 coordinator/build tools, Linux/ARM64 Node 24.10.0 for isolated Jest, installed Chrome 156.0.8078.80. Start local Docker and explicitly install the pinned image in `isolation.json`; checks never auto-pull. Run `npm run isolation:probe` after bootstrap and before final readiness. See EXECUTION.md. No general Linux/Windows/browser compatibility claim. Only canonical and targeted upstream Jest execute in the enforced non-root/read-only/no-network boundary. Complete worker/build/browser isolation and immutable dependency environments remain unfinished; run only trusted projects on this workstation.

The revised exported-checkout rehearsal passed on **5 November 2026 at 22:09 UTC**: all **16 steps** completed, including first-run isolation canaries, original source/HTTP failures, patch application and repaired source/HTTP/regression/browser/readiness. It reused the npm cache and already-installed pinned image on the same Mac; no private keys/policy were copied, and approval remained false. `clean-reproduction.json` records command exits/durations, runtime and the tested code/config input-file hash.

The earlier rehearsal is preserved separately as `clean-reproduction-20261104.json`: on 4 November 2026 at 22:19 UTC all 15 commands completed, including fresh locked installs, original source/HTTP failures, patch application and all repaired source/HTTP/regression/browser checks. It reused the package cache on the same Mac, not a fresh OS or independently reprovisioned Switch deployment. No credentials/private policy were copied. The new output was ready for review but correctly unapproved. Actual command/exit/duration receipt: `evidence/recorded/clean-reproduction.json` in the public snapshot (`evidence/runs/clean-reproduction.json` in the development archive).
