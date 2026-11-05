# Scoped Jest execution boundary — 5 November 2026

## Implemented, not retroactive

The canonical SDK/UI acceptance suites and selected upstream Jest suites now execute in separate **non-root, no-network containers**, not host Jest processes. The historical repairs were performed by the trusted coding session before this boundary existed. This is **not complete repair-worker, build, HTTP, browser or coordinator isolation**. Do not run arbitrary hostile repositories on a sensitive workstation.

`src/isolated-runtime.mjs` is the shared mandatory runner. Missing Docker, the pinned image, a compatible platform or valid output fails closed; there is no host Jest fallback. Root project unit tests still run on the trusted host.

## What is mounted

- An owned snapshot of tracked/nonignored public repository files, without `.git` or ignored files; symbolic links are copied as links, never dereferenced. Static ancestor-symlink escapes are rejected before snapshotting **and fingerprinting**. Git fsmonitor execution is disabled for these file inventories.
- A copy of the original hash-pinned canonical test when running acceptance. The original acceptance files and `case.json` were not changed.
- Existing locked public dependency trees, and the identified SDK package/link target where needed.
- A trusted runner entrypoint.

All bind mounts are **read-only**. Home directories, Switch credentials/policy/receipts, Docker sockets and the parent environment are not mounted/forwarded. Jest's report stays in bounded container `/tmp`, then returns over bounded stdout; no writable host evidence directory is exposed. The trusted coordinator writes evidence after execution.

## Runtime and limits

`isolation.json` pins the existing Linux/ARM64 Node **24.10.0** image by digest. The coordinator and host build/browser tools still use Node **22.14.0**. Tested here on Apple-silicon macOS with Docker Desktop—not all platforms.

- Image pull policy: **never** during checks.
- Network: `none`; no exposed ports.
- UID/GID: the non-root local operator's numeric identity.
- Root filesystem and binds: read-only; capabilities dropped; no new privileges.
- Memory/swap: 1536 MiB; CPUs: 2; process limit: 64.
- Scratch: 256 MiB tmpfs, `nosuid,nodev,noexec`.
- Outer execution timeout: 180 seconds, with cleanup of only that randomly named owned container.

A fresh operator must explicitly install Docker and the pinned image; the verifier will not do so silently. On a compatible ARM64 host, after reviewing the configuration:

```sh
docker pull node@sha256:b8d2197aff9129d16c801a3e3e1b2a873c4946480f5a310f38056df2268c38d9
npm run isolation:probe
npm run verify
npm run regressions
```

No image was downloaded for this implementation: the declared image already existed locally. An x86 image substitution requires an explicit config change, fresh evidence and a new review bundle; it is not claimed supported by this run.

## Actual checks

- `evidence/runs/isolation-probe.json`: genuine container canaries for denied host read/write, protected-test append/chmod, source/dependency/root writes, no inherited secret sentinel or Docker socket, read-only mounts, zero effective capabilities, no-new-privileges and loopback-only interfaces. Writable scratch remains usable. Only synthetic canaries are used.
- `isolation-unavailable-probe.json`: intentionally nonexistent local Docker socket was rejected without host fallback or replacing source evidence; the real daemon was not stopped.
- `isolated-original-baseline.json`: original pinned SDK/UI states reproduced **4 SDK + 1 UI failures** inside the new boundary, using our owned rehearsal checkout—not resetting the live repaired trees.
- Repaired execution: **7 SDK + 5 UI canonical cases**, **36 SDK + 137 UI targeted upstream tests**. Exact canonical full names/counts and complete non-skipped assertion inventories are required; an empty, filtered or undersized run cannot certify completion.
- **41** own unit tests include static ancestor-escape, snapshot omission, remote-Docker rejection, fixed container arguments and inventory guards.

The first resumed full Switch check correctly blocked mode-only cache drift: BSD tar obeyed the caller's umask, producing different executable bits from the same archive. `extractArtifact` now pins restrictive `077` extraction and restores the caller's mask. `artifact-extraction-umask-probe.json` reproduces both inherited outcomes and verifies the fix matches the existing cache without relaxing byte/mode drift checks or changing the archive.

`isolation-switch-confirmation.json` records the final actual Switch-triggered complete pipeline. `isolation-profile-drift-probe.json` changes only CPU-profile configuration, observes an actual stale Switch reply, restores exact bytes and recovers the same unapproved candidate while leaving historical review receipts untouched.

Readiness version **4** requires current image/profile identity, a matching passing probe and enforced execution records for both canonical and regression components. Changed runtime/checker inputs cannot inherit the November 4 human approval.

## Remaining trust

The local Docker daemon, pinned image, dependency installation, trusted coordinator, Switch and local storage remain trusted. Snapshot preparation must occur before untrusted execution: static ancestor checks are not race-proof `openat2` containment against a concurrent privileged host. Docker is not a proof against kernel/daemon compromise. The checks do not prove arbitrary malicious JavaScript cannot interfere with its own test runtime/report. Whole repair-worker containment and isolated build/browser execution remain unfinished. Hashes bind consistent inputs; they do not make storage immutable.
