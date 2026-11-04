# Security and trust boundaries

This is a local historical demonstration, not a production isolation or security product.

- The normal verifier trusts the Switch server, its local process/storage, and the code/dependencies it executes. **Complete filesystem isolation for repair workers and untrusted test code is not implemented.** Do not execute arbitrary hostile repositories on a workstation containing sensitive data.
- A normal agent chat/API identity cannot become the configured reviewer by changing a display name or claiming to be human. An actual coding-agent approval attempt was rejected. Reviewer enrollment is an explicit trusted-operator action using a confirmed message's server-origin sender.
- These controls do not stop a privileged host attacker from altering policy, receipts, code or credentials. Hashes are consistency binding, not an immutable storage boundary.
- The original repair used one existing coding session with operator tooling. It was not retroactively sandboxed. Failed standalone CLI attempts are not successful independent workers.
- Use only your own local keys. Keep `.secrets/`, `.cache/`, `switch.local.json`, `.env` and signed-in profiles out of Git. Recorded sanitised receipts are historical and must never be copied into a new run as authority.
- Approval applies only to the exact local tested bundle. There is no merge/deploy/publish/submit actuator. Changing relevant inputs invalidates current approval; exact restoration can match the original receipt again.
- Browser fixtures use an isolated existing Chrome profile and a loopback-only synthetic echo service. The declared cases are not an exhaustive browser/schema or dependency audit.

Public release preparation uses an explicit export allowlist, token-pattern checks and exact matching against project credential values. This reduces accidental disclosure; it is not proof that every possible secret or vulnerability has been detected. No production/customer data or funds are in scope.
