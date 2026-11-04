import test from 'node:test';
import assert from 'node:assert/strict';
import { parseVerifierCommand } from '../src/switch-commands.mjs';

test('only literal supported commands are accepted', () => {
  assert.equal(parseVerifierCommand('@crossrepo-verifier status'), 'status');
  assert.equal(parseVerifierCommand('@crossrepo-verifier: CHECK'), 'check');
  assert.equal(parseVerifierCommand('check'), 'check');
});
test('chat is never executable shell input or approval', () => {
  for (const text of ['check; rm -rf /', 'please check this', 'approved', '@other check', 'check\nstatus', '', null]) {
    assert.equal(parseVerifierCommand(text), null);
  }
});
test('oversized message bodies are not commands', () => {
  assert.equal(parseVerifierCommand(' '.repeat(1001) + 'check'), null);
});
