import { readFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SwitchClient } from '../src/switch-client.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(readFileSync(join(root, 'switch.local.json')));
const credentials = JSON.parse(readFileSync(join(root, '.secrets/coding-assistant.json')));
const command = process.argv[2];
if (!['context', 'post'].includes(command)) throw new Error('Usage: session.mjs context | post [thread-id], message on stdin. Posts use the agent identity, never a human.');
const client = await new SwitchClient(credentials, config.roomId).connect();
try {
  if (command === 'context') console.log(JSON.stringify(await client.operation('read_context', { room_id: config.roomId, limit: 50 }), null, 2));
  else {
    const body = readFileSync(0, 'utf8').trim();
    if (!body || body.length > 16000) throw new Error('Message must be 1–16000 characters.');
    console.log(JSON.stringify(await client.post(body, process.argv[3] || null), null, 2));
  }
} finally { client.close(); }
