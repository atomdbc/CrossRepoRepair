import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyBrowserObservation as classify } from '../src/browser-verification.mjs';
const valid = () => ({
  variant: 'both-fixed',
  mode: 'encoded-union',
  parameterValues: { 'query.parameters': '["a","b"]' },
  observationMs: 1500,
  exceptions: [],
  requests: [{ values: ['a', 'b'] }],
  after: { loading: false, errors: [], body: 'Server response' },
});
test('encoded input must reach actual repeated HTTP values', () => {
  const r = valid();
  assert.equal(classify(r).passed, true);
  r.requests[0].values = ['["a","b"]'];
  assert.equal(classify(r).passed, false);
});
test('a rendered success message alone is not network evidence', () => {
  const r = valid();
  r.requests = [];
  assert.equal(classify(r).passed, false);
});
test('typed array input cannot masquerade as the encoded-string case', () => {
  const r = valid();
  r.parameterValues['query.parameters'] = ['a', 'b'];
  assert.equal(classify(r).passed, false);
});
test('UI-only repair must expose the old SDK wire failure', () => {
  const r = valid();
  r.variant = 'ui-only';
  r.requests[0].values = ['["a","b"]'];
  assert.equal(classify(r).classification, 'expected_partial_failure_observed');
  r.requests[0].values = ['a', 'b'];
  assert.equal(classify(r).passed, false);
});
test('partial loader failure requires the complete observation window', () => {
  const r = {
    ...valid(),
    variant: 'sdk-only',
    mode: 'invalid-array',
    parameterValues: { 'query.parameters': 'not-an-array' },
    requests: [],
    observationMs: 7000,
    after: { loading: true, errors: [], body: '' },
  };
  assert.equal(classify(r).classification, 'expected_partial_failure_observed');
  r.observationMs = 10;
  assert.equal(classify(r).passed, false);
});
