import test from 'node:test';
import assert from 'node:assert/strict';
import { inventorySatisfied } from '../src/test-inventory.mjs';
const fixture = () => ({
  numTotalTests: 2,
  numPassedTests: 1,
  numFailedTests: 1,
  testResults: [
    {
      assertionResults: [
        { fullName: 'required-A', status: 'passed' },
        { fullName: 'required-B', status: 'failed' },
      ],
    },
  ],
});
test('inventory accepts actual pass/fail assertions without redefining required names', () =>
  assert.equal(inventorySatisfied(fixture(), { names: ['required-A', 'required-B'] }), true));
test('same count with a missing canonical name is not complete acceptance', () =>
  assert.equal(inventorySatisfied(fixture(), { names: ['required-A', 'different'] }), false));
test('filtered, skipped or undersized regression runs cannot certify completeness', () => {
  const r = fixture();
  assert.equal(inventorySatisfied(r, { minimum: 3 }), false);
  r.testResults[0].assertionResults[1].status = 'pending';
  assert.equal(inventorySatisfied(r), false);
});
