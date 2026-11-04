import { digest } from './verification.mjs';

export function parseReviewCommand(body, name = 'crossrepo-verifier') {
  if (typeof body !== 'string' || body.length > 1000) return null;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const text = body
    .trim()
    .replace(new RegExp(`^@${escaped}[\\s,:]+`, 'i'), '')
    .trim();
  const match = /^approve\s+([a-f0-9]{64})$/i.exec(text);
  return match ? { bundleId: match[1].toLowerCase() } : null;
}
export function reviewerAllowed(policy, event) {
  return (
    policy?.version === 1 &&
    Number.isFinite(Date.parse(policy.activatedAt)) &&
    event?.roomId === policy.roomId &&
    typeof event.sender === 'string' &&
    Array.isArray(policy.allowedSenders) &&
    policy.allowedSenders.includes(event.sender) &&
    Array.isArray(policy.deniedAgentSenders) &&
    !policy.deniedAgentSenders.includes(event.sender)
  );
}
export function decideReview(policy, event, readiness, records = []) {
  const deny = (reason) => ({ accepted: false, reason });
  if (!reviewerAllowed(policy, event)) return deny('not_authorized_reviewer');
  if (
    typeof event.messageId !== 'string' ||
    !event.messageId ||
    !Number.isSafeInteger(event.timestamp) ||
    event.timestamp < Date.parse(policy.activatedAt)
  )
    return deny('invalid_or_pre_enrollment_event');
  if (!readiness?.fresh || !readiness.readyForHumanReview)
    return deny('checks_missing_failed_or_stale');
  if (
    readiness.contractHash !== policy.contractHash ||
    readiness.browser?.contractHash !== policy.browserContractHash
  )
    return deny('contract_not_authorized');
  if (event.bundleId !== readiness.bundleId) return deny('bundle_mismatch');
  const policyHash = digest(JSON.stringify(policy));
  const prior = records.find((r) => r.messageId === event.messageId);
  if (prior)
    return prior.sender === event.sender &&
      prior.bundleId === event.bundleId &&
      prior.policyHash === policyHash
      ? { accepted: false, reason: 'already_recorded' }
      : deny('replayed_event_conflict');
  return {
    accepted: true,
    reason: 'approved_for_local_review_only',
    record: {
      version: 1,
      roomId: event.roomId,
      sender: event.sender,
      messageId: event.messageId,
      timestamp: event.timestamp,
      bundleId: event.bundleId,
      policyHash,
      contractHash: readiness.contractHash,
      browserContractHash: readiness.browser.contractHash,
      recordedAt: new Date().toISOString(),
      scope:
        'Local tested patch bundle only; no merge, deployment, publication or hackathon submission',
    },
  };
}
export function currentApproval(policy, readiness, records = []) {
  if (!policy || !readiness?.fresh || !readiness.readyForHumanReview) return null;
  const policyHash = digest(JSON.stringify(policy));
  return (
    [...records]
      .reverse()
      .find(
        (r) =>
          reviewerAllowed(policy, { roomId: r.roomId, sender: r.sender }) &&
          r.version === 1 &&
          r.policyHash === policyHash &&
          r.bundleId === readiness.bundleId &&
          r.contractHash === readiness.contractHash &&
          r.browserContractHash === readiness.browser?.contractHash &&
          r.contractHash === policy.contractHash &&
          r.browserContractHash === policy.browserContractHash &&
          Number.isSafeInteger(r.timestamp) &&
          r.timestamp >= Date.parse(policy.activatedAt)
      ) || null
  );
}
