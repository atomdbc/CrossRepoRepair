import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const baseUrl = (process.env.SWITCH_URL || 'http://127.0.0.1:54349').replace(/\/$/, '');
if (!['127.0.0.1', 'localhost'].includes(new URL(baseUrl).hostname)) throw new Error('This demo registration tool is restricted to a local Switch server.');
const directory = join(root, '.secrets');
mkdirSync(directory, { recursive: true, mode: 0o700 });
const path = join(directory, 'verifier.json');
let agent;
if (existsSync(path)) {
  agent = JSON.parse(readFileSync(path));
  if (agent.baseUrl !== baseUrl) throw new Error('Existing verifier belongs to another server. Not overwriting credentials.');
} else {
  const token = process.env.SWITCH_REGISTRATION_KEY ||
    JSON.parse(readFileSync(join(directory, 'registration-response.json'))).body.key;
  const response = await fetch(baseUrl + '/agents', {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'crossrepo-verifier', description: 'Deterministic local acceptance verifier. No language model or autonomous deployment.',
      connector_type: 'crossreporepair-node',
      integration_profile: { connection_model: 'always_on', message_exchange: true,
        pre_invocation_mediation: [], post_invocation_mediation: [], event_reporting: [] },
    }),
  });
  if (!response.ok) throw new Error(`Verifier registration failed: HTTP ${response.status} ${await response.text()}`);
  const registered = await response.json();
  if (!registered.id || !registered.api_key) throw new Error('Unexpected registration response; credentials not logged.');
  agent = { baseUrl, agentId: registered.id, apiKey: registered.api_key };
  writeFileSync(path, JSON.stringify(agent, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
}
const response = await fetch(`${baseUrl}/agents/${agent.agentId}/ops`, { headers: { Authorization: `Bearer ${agent.apiKey}` } });
if (!response.ok) throw new Error(`Operation discovery failed: HTTP ${response.status}`);
const catalog = await response.json();
mkdirSync(join(root, 'evidence/runs'), { recursive: true });
writeFileSync(join(root, 'evidence/runs/switch-operations.json'), JSON.stringify(catalog, null, 2) + '\n');
console.log(JSON.stringify({ agentId: agent.agentId, baseUrl, registration: 'stored locally with owner-only permissions; no secrets printed', operations: Object.keys(catalog.operations || {}) }, null, 2));
