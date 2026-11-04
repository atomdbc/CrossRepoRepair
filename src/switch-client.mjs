import WebSocket from 'ws';
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { acceptsConnectionState } from './switch-protocol.mjs';

// One room-scoped session for a manually invoked coding turn. No model or shell here.
export class SwitchClient extends EventEmitter {
  constructor(credentials, roomId, revision = 6) {
    super();
    this.credentials = credentials; this.roomId = roomId; this.revision = revision;
    this.connectionId = randomUUID(); this.cursor = 0;
    const url = new URL(credentials.baseUrl);
    if (!['127.0.0.1', 'localhost'].includes(url.hostname)) throw new Error('Only local demo servers are allowed.');
  }
  async connect() {
    const { baseUrl, agentId, apiKey } = this.credentials;
    const url = new URL(`/agents/${agentId}/connection/ws`, baseUrl);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    for (const [key, value] of Object.entries({ connection_id: this.connectionId, rooms: this.roomId,
      scope: 'single', filter: 'all', start_from: 'head', protocol: this.revision,
      protocol_accepts: this.revision, client: 'crossreporepair-role', client_version: '0.1.0' })) url.searchParams.set(key, String(value));
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Switch connection timed out')), 15000);
      const fail = error => { clearTimeout(timer); reject(error); };
      this.socket = new WebSocket(url, { headers: { Authorization: `Bearer ${apiKey}` }, maxPayload: 1024 * 1024 });
      this.socket.on('error', fail);
      this.socket.on('message', raw => {
        let frame;
        try { frame = JSON.parse(raw.toString()); } catch { this.close(); fail(new Error('Invalid Switch frame')); return; }
        const kind = frame.event || frame.type, data = frame.data || frame;
        if (kind === 'ping') { this.socket.send(JSON.stringify({ type: 'pong', cursor: this.cursor })); return; }
        if (kind === 'connection_state') {
          if (!acceptsConnectionState(data, this.roomId, this.revision)) { this.close(); fail(new Error('Incompatible Switch connection')); return; }
          clearTimeout(timer); this.cursor = data.cursor; resolve(); return;
        }
        if (['refused', 'gap', 'evicted'].includes(kind)) {
          this.emit('unavailable', { kind }); this.close(); fail(new Error(`Switch session ${kind}`)); return;
        }
        if (Number.isSafeInteger(frame.id ?? data.sequence)) {
          this.cursor = Math.max(this.cursor, frame.id ?? data.sequence);
          this.emit('roomEvent', data);
        }
      });
      this.socket.on('close', () => this.emit('unavailable', { kind: 'closed' }));
    });
    return this;
  }
  async operation(name, args = {}) {
    const { baseUrl, agentId, apiKey } = this.credentials;
    const response = await fetch(`${baseUrl}/agents/${agentId}/ops/${name}`, {
      method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json',
        'X-Switch-Connection-Id': this.connectionId }, body: JSON.stringify(args), signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw new Error(`Switch ${name}: HTTP ${response.status}`);
    return (await response.json()).result;
  }
  post(body, threadId = null) { return this.operation('post_message', { body, thread_id: threadId }); }
  close() { this.socket?.close(); }
}
