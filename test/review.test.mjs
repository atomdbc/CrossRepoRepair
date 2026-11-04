import test from 'node:test';
import assert from 'node:assert/strict';
import { parseReviewCommand, decideReview, currentApproval } from '../src/review.mjs';
const bundle = 'a'.repeat(64);
const fixture = () => ({
  policy: {
    version: 1,
    roomId: 'room',
    allowedSenders: ['opaque-human-fixture'],
    deniedAgentSenders: ['opaque-agent-fixture'],
    activatedAt: '2026-11-04T20:00:00Z',
    contractHash: 'contract',
    browserContractHash: 'browser-contract',
  },
  event: {
    roomId: 'room',
    sender: 'opaque-human-fixture',
    messageId: 'event-fixture',
    timestamp: Date.parse('2026-11-04T21:00:00Z'),
    bundleId: bundle,
  },
  ready: {
    fresh: true,
    readyForHumanReview: true,
    bundleId: bundle,
    contractHash: 'contract',
    browser: { contractHash: 'browser-contract' },
  },
});
test('only exact approve plus full bundle hash is a review command', () => {
  assert.deepEqual(parseReviewCommand(`@crossrepo-verifier approve ${bundle}`), {
    bundleId: bundle,
  });
  for (const s of [
    'approved',
    'approve',
    'approve abc',
    `approve ${bundle}; echo yes`,
    `status\napprove ${bundle}`,
  ])
    assert.equal(parseReviewCommand(s), null);
});
test('status is not approval', () =>
  assert.equal(parseReviewCommand('@crossrepo-verifier status'), null));
test('exact authenticated fixture reviewer may approve a current local bundle', () => {
  const f = fixture(),
    r = decideReview(f.policy, f.event, f.ready);
  assert.equal(r.accepted, true);
  assert.equal(currentApproval(f.policy, f.ready, [r.record]).messageId, f.event.messageId);
});
test('display names and claimed human fields cannot authorize an agent', () => {
  const f = fixture();
  f.event.sender = 'opaque-agent-fixture';
  f.event.sender_name = 'user';
  f.event.claimed_role = 'human';
  assert.equal(decideReview(f.policy, f.event, f.ready).reason, 'not_authorized_reviewer');
});
test('missing policy and different room deny review', () => {
  const f = fixture();
  assert.equal(decideReview(null, f.event, f.ready).accepted, false);
  f.event.roomId = 'another';
  assert.equal(decideReview(f.policy, f.event, f.ready).accepted, false);
});
test('wrong bundle, changed requirements and stale evidence deny review', () => {
  let f = fixture();
  f.event.bundleId = 'b'.repeat(64);
  assert.equal(decideReview(f.policy, f.event, f.ready).reason, 'bundle_mismatch');
  f = fixture();
  f.ready.fresh = false;
  assert.equal(decideReview(f.policy, f.event, f.ready).accepted, false);
  f = fixture();
  f.ready.contractHash = 'changed';
  assert.equal(decideReview(f.policy, f.event, f.ready).reason, 'contract_not_authorized');
});
test('replay is idempotent and pre-enrollment messages cannot approve', () => {
  const f = fixture(),
    r = decideReview(f.policy, f.event, f.ready);
  assert.equal(decideReview(f.policy, f.event, f.ready, [r.record]).reason, 'already_recorded');
  f.event.timestamp = 1;
  assert.equal(decideReview(f.policy, f.event, f.ready).accepted, false);
});
test('old approvals do not carry to changed source/bundle or policy', () => {
  const f = fixture(),
    r = decideReview(f.policy, f.event, f.ready);
  assert.equal(
    currentApproval(f.policy, { ...f.ready, bundleId: 'b'.repeat(64) }, [r.record]),
    null
  );
  f.policy.allowedSenders = [];
  assert.equal(currentApproval(f.policy, f.ready, [r.record]), null);
});
