import test from 'node:test';
import assert from 'node:assert/strict';
import { acceptsConnectionState } from '../src/switch-protocol.mjs';
const sample = () => ({ rooms: ['room'], cursor: 4294967296, generation: 8589934594, protocol: 9,
  server: { contracts: { 'agent-protocol': { speaks: 9, accepts: 1 } } }, client: { speaks: 6, accepts: 6 } });
test('accepts the observed server-9/client-6 backward-compatible state', () => {
  assert.equal(acceptsConnectionState(sample(), 'room', 6), true);
});
test('rejects a missing room or unsafe cursor', () => {
  assert.equal(acceptsConnectionState(sample(), 'other', 6), false);
  assert.equal(acceptsConnectionState({ ...sample(), cursor: Number.MAX_SAFE_INTEGER + 1 }, 'room', 6), false);
});
test('rejects incompatible ranges and an unexpected echoed client', () => {
  const state = sample(); state.server.contracts['agent-protocol'].accepts = 7;
  assert.equal(acceptsConnectionState(state, 'room', 6), false);
  assert.equal(acceptsConnectionState({ ...sample(), client: { speaks: 5, accepts: 5 } }, 'room', 6), false);
});
