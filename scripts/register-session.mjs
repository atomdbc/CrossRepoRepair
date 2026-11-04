import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const directory = join(root, '.secrets');
mkdirSync(directory, { recursive: true, mode: 0o700 });
const path = join(directory, 'coding-assistant.json');
if (existsSync(path)) {
  const a = JSON.parse(readFileSync(path));
  console.log(JSON.stringify({ agentId: a.agentId, baseUrl: a.baseUrl, existing: true }));
} else {
  const baseUrl = process.env.SWITCH_URL || JSON.parse(readFileSync(join(root, 'switch.local.json'))).baseUrl;
  if (!['127.0.0.1','localhost'].includes(new URL(baseUrl).hostname)) throw new Error('Local demo server required');
  const token = process.env.SWITCH_REGISTRATION_KEY || JSON.parse(readFileSync(join(directory, 'registration-response.json'))).body.key;
  const response = await fetch(baseUrl + '/agents', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type':'application/json' },
    body: JSON.stringify({ name:'coding-assistant', description:'Existing coding-assistant session, manually polled through session.mjs. One session may perform both repository roles; not two independent model agents.',
      connector_type:'coding-session-protocol', integration_profile:{connection_model:'session_passive',message_exchange:true,pre_invocation_mediation:[],post_invocation_mediation:[],event_reporting:[]} }) });
  if (!response.ok) throw new Error(`Registration failed: HTTP ${response.status}`);
  const a = await response.json();
  if (!a.id || !a.api_key) throw new Error('Unexpected registration response');
  writeFileSync(path,JSON.stringify({baseUrl,agentId:a.id,apiKey:a.api_key},null,2),{flag:'wx',mode:0o600});
  console.log(JSON.stringify({agentId:a.id,baseUrl,existing:false}));
}
