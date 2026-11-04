# Acceptance requirements — defined before implementation

Original requirements below remain unchanged. The pinned source fixtures now pass (12), as do actual HTTP checks (3). Browser contract version 2 adds a four-state matrix: 20 outcomes verified, including five expected broken-state observations; only both-fixed satisfies all five candidate browser scenarios. Original SDK/UI test files/hash pins were not edited. Genuine exact-bundle human approval is now recorded; complete isolation remains unfinished. Actual scope/results: RUNNING.md, BROWSER.md and evidence/runs/.

## Behavioural checks

| ID | Case | Required outcome |
|---|---|---|
| B01 | A JSON-encoded array input (`'["a","b"]'`) under an array-capable OpenAPI 3.1 union such as `type: [array, null]`, with form/explode enabled | The decoded query has repeated `parameters` values `a`, `b`, not a single incorrectly serialised string. |
| B02 | The same encoded-array input under anyOf/oneOf or a nested combined array/null schema | Correct array handling survives the schema composition. |
| B03 | Primitive string under a string-only schema | It remains one string parameter. |
| B04 | JSON-array-looking string under a string-only schema | It remains a string; the repair must not indiscriminately coerce JSON-looking strings. |
| B05 | String supplied where the UI requires an array | A visible validation error; no indefinitely running loader. |
| B06 | Missing required array | Existing required-value validation remains intact. |

B01/B02 must include the string-encoded representation handled by the request-building API. Supplying only an already-typed JavaScript array may miss the actual failure. String-only cases must explicitly declare that schema; an ambiguous union is not a universal licence to guess user intent.

Compare equivalent decoded query semantics, not an unnecessarily brittle raw parameter ordering or encoding spelling. Expected behaviour must come from the agreed requirements and relevant existing behaviour, not from whatever patch the model produced.

## Shared-task checks

| ID | Case | Required outcome |
|---|---|---|
| W01 | One repository fixed, the other still wrong | The combined task remains incomplete. |
| W02 | Relevant repairs and required regressions pass | Produce a reviewable two-repository bundle with actual runner evidence. |
| W03 | Either code revision changes after a successful check | Previous readiness/approval cannot certify the new bundle. |
| W04 | Requirements or checker change without authorised review | Reject stale evidence or require an explicitly reviewed new contract/version. |
| W05 | A chat message merely claims success | Do not mark the task verified without matching runner results. |
| W06 | A person approves the tested bundle | Record the exact tested revisions and acceptance version; no autonomous production action. |

Use real permission/isolation boundaries when claiming the repair worker cannot alter acceptance checks. A prompt asking an unrestricted agent not to edit a file is not an enforced boundary. Fully compromised-host security is not claimed.

## Evidence to retain after execution

- Reference case and declared supported behaviour.
- Before/after revision identifiers and patch diffs for both repositories.
- Acceptance-contract and runner versions/fingerprints.
- Actual commands, exit statuses and relevant redacted output.
- Required regressions, failures, interventions and limitations.
- Human review of the corresponding bundle.

A successful single case is a reproducible demonstration, not a broad benchmark result or proof of universal correctness. Before/after source, HTTP and scoped browser results exist under evidence/runs/. The declared case is repaired; genuine local human approval is recorded, but no broad benchmark result or complete isolation is claimed.
