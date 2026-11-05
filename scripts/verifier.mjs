import WebSocket from 'ws';
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { digest, fingerprintRepository, acceptanceMatches } from '../src/verification.mjs';
import { parseVerifierCommand } from '../src/switch-commands.mjs';
import { acceptsConnectionState } from '../src/switch-protocol.mjs';
import { parseReviewCommand, reviewerAllowed, decideReview } from '../src/review.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(readFileSync(join(root, 'switch.local.json')));
const credentials = JSON.parse(readFileSync(join(root, '.secrets/verifier.json')));
if (
  config.baseUrl !== credentials.baseUrl ||
  !['127.0.0.1', 'localhost'].includes(new URL(config.baseUrl).hostname)
) {
  throw new Error('Verifier is restricted to the configured local Switch server.');
}
const cache = join(root, '.cache');
mkdirSync(cache, { recursive: true });
const statePath = join(cache, 'verifier-state.json');
const pidPath = join(cache, 'verifier.pid');
if (existsSync(pidPath)) {
  const pid = Number(readFileSync(pidPath, 'utf8'));
  let live = false;
  try {
    process.kill(pid, 0);
    live = true;
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
  }
  if (live) throw new Error('A verifier PID is already live. Not starting a second client.');
  unlinkSync(pidPath);
}
writeFileSync(pidPath, String(process.pid), { flag: 'wx', mode: 0o600 });
const previous = existsSync(statePath) ? JSON.parse(readFileSync(statePath)) : null;
if (previous && previous.agentId !== credentials.agentId)
  throw new Error('Stored connection belongs to another agent.');
let state = previous || {
  agentId: credentials.agentId,
  connectionId: randomUUID(),
  cursor: null,
  generation: null,
  announced: false,
};
let stopped = false;
let socket;
let reconnectTimer;
let queue = Promise.resolve();
let queued = 0;
const execute = promisify(execFile);
const log = (kind, fields = {}) =>
  console.log(JSON.stringify({ at: new Date().toISOString(), kind, ...fields }));
const save = () => writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n', { mode: 0o600 });

async function operation(name, args) {
  const response = await fetch(`${config.baseUrl}/agents/${credentials.agentId}/ops/${name}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${credentials.apiKey}`,
      'Content-Type': 'application/json',
      'X-Switch-Connection-Id': state.connectionId,
    },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`Switch ${name}: HTTP ${response.status}`);
  return (await response.json()).result;
}
const post = (body, threadId = null) => operation('post_message', { body, thread_id: threadId });

function latestSummary() {
  const pointer = JSON.parse(readFileSync(join(cache, 'latest-verification.json')));
  const path = resolve(root, pointer.summary);
  if (!path.startsWith(join(root, 'evidence/runs') + '/'))
    throw new Error('Unexpected summary path.');
  return JSON.parse(readFileSync(path));
}
function summaryText(summary, readiness = null) {
  const manifestBytes = readFileSync(join(root, 'case.json'));
  const manifest = JSON.parse(manifestBytes);
  const current =
    digest(manifestBytes) === summary.caseHash &&
    summary.components.every((result) => {
      const repo = manifest.repositories.find((r) => r.id === result.id);
      return (
        repo &&
        result.sourceFingerprint === fingerprintRepository(join(root, repo.directory)) &&
        acceptanceMatches(readFileSync(join(root, repo.acceptance)), repo.acceptanceHash)
      );
    });
  const totals = summary.components
    .map((r) => `${r.id}: ${r.passed} pass / ${r.failed} fail (${r.classification})`)
    .join('; ');
  return (
    `Last completed check ${summary.runId}: ${totals}. ` +
    ((readiness ? readiness.fresh : current)
      ? 'At the recorded evaluation, source and contract matched the checks. '
      : 'STALE at evaluation: source, contract, runtime or required evidence no longer matches; request a new check. ') +
    'Coverage: canonical and targeted upstream Jest checks use read-only, non-root, no-network containers; builds/HTTP/browser control remain trusted-host steps. This recorded repair uses one coding session in two repository roles. Scoped browser checks are mandatory. ' +
    'Review requires the enrolled sender and full current bundle hash; no merge or deployment performed.'
  );
}
async function runStep(script) {
  return execute(process.execPath, [join(root, 'scripts', script)], {
    cwd: root,
    timeout: 420000,
    maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, PATH: dirname(process.execPath) + ':' + process.env.PATH },
  }).catch((error) => {
    log('step_failed', {
      script,
      code: error.code,
      signal: error.signal,
      message: String(error.message).split('\n')[0],
    });
    throw error;
  });
}
async function refreshReadiness() {
  const started = Date.now();
  try {
    await runStep('evaluate-readiness.mjs');
  } catch {
    /* a fresh blocking verdict is still useful */
  }
  try {
    const r = JSON.parse(readFileSync(join(root, 'evidence/runs/readiness.json')));
    return Date.parse(r.recordedAt) >= started ? r : null;
  } catch {
    return null;
  }
}
const reviewPolicy = () =>
  existsSync(join(root, '.secrets/review-policy.json'))
    ? JSON.parse(readFileSync(join(root, '.secrets/review-policy.json')))
    : null;
const reviewRecords = () =>
  existsSync(join(root, 'evidence/runs/reviews.json'))
    ? JSON.parse(readFileSync(join(root, 'evidence/runs/reviews.json')))
    : [];
async function handle(data) {
  if (data.type !== 'message' || data.room_id !== config.roomId || data.payload?.addressed !== true)
    return;
  const payload = data.payload;
  const command = parseVerifierCommand(payload.body, config.agentName);
  const review = parseReviewCommand(payload.body, config.agentName);
  const thread = payload.thread_id || payload.message_id || null;
  log('addressed_message', {
    messageId: payload.message_id,
    sender: payload.sender,
    command: review ? 'approve' : command || 'unsupported',
  });
  if (review) {
    const event = {
      sender: payload.sender,
      roomId: data.room_id,
      messageId: payload.message_id,
      timestamp: payload.timestamp,
      bundleId: review.bundleId,
    };
    const policy = reviewPolicy();
    const readiness = reviewerAllowed(policy, event) ? await refreshReadiness() : null;
    const records = reviewRecords();
    if (!Array.isArray(records)) throw Error('Invalid review ledger');
    const decision = decideReview(policy, event, readiness, records);
    const attemptsPath = join(root, 'evidence/runs/review-attempts.json');
    const attempts = existsSync(attemptsPath) ? JSON.parse(readFileSync(attemptsPath)) : [];
    attempts.push({
      recordedAt: new Date().toISOString(),
      ...event,
      accepted: decision.accepted,
      reason: decision.reason,
    });
    writeFileSync(attemptsPath, JSON.stringify(attempts, null, 2) + '\n');
    if (decision.accepted) {
      writeFileSync(
        join(root, 'evidence/runs/reviews.json'),
        JSON.stringify([...records, decision.record], null, 2) + '\n'
      );
      const confirmed = await refreshReadiness();
      await post(
        confirmed?.approved
          ? `Human review recorded for exact bundle ${readiness.bundleId}. Local patch review only; nothing merged, deployed, published or submitted.`
          : 'Review receipt stored, but inputs no longer match; approval is not current. Request status/check.',
        thread
      );
    } else
      await post(
        `Review not recorded: ${decision.reason}. No merge, deployment, publication or submission.`,
        thread
      );
    return;
  }
  if (!command) {
    await post(
      'Supported: status, check, or approve followed by the full current bundle hash. Only the explicitly enrolled reviewer may approve. No deployment or submission action exists.',
      thread
    );
    return;
  }
  if (command === 'status') {
    const readiness = await refreshReadiness();
    await post(
      summaryText(latestSummary(), readiness) +
        (readiness
          ? ` Bundle ${readiness.bundleId}: ${readiness.reason}. Human review: ${readiness.approved ? 'recorded for this exact bundle' : 'pending'}.`
          : ' No complete review bundle exists.'),
      thread
    );
    return;
  }
  await post(
    'Running the fixed local acceptance pipeline. A model statement or one green repository cannot close the shared task.',
    thread
  );
  const pipelineStarted = Date.now();
  let infrastructureError = false;
  try {
    await runStep('probe-isolation.mjs');
    await runStep('link-sdk.mjs');
  } catch {
    infrastructureError = true;
  }
  if (!infrastructureError) {
    // Source/Jest steps require the pinned local isolated runtime; no host fallback.
    // These commands intentionally return nonzero on behavioural failures.
    try {
      await runStep('reproduce.mjs');
    } catch {
      /* classify the written runner report below */
    }
    try {
      await runStep('check-linked-sdk.mjs');
    } catch {
      /* actual HTTP results remain in evidence */
    }
    try {
      await runStep('check-regressions.mjs');
    } catch {
      /* failing regressions remain a blocking report */
    }
    try {
      await runStep('build-browser.mjs');
      await runStep('check-browser.mjs');
    } catch {
      /* missing/stale/failing browser evidence blocks readiness below */
    }
    try {
      await runStep('evaluate-readiness.mjs');
    } catch {
      /* a false readiness verdict is not an infrastructure crash */
    }
    const summary = latestSummary();
    let network;
    try {
      network = JSON.parse(readFileSync(join(root, 'evidence/runs/linked-sdk-http.json')));
    } catch {
      network = null;
    }
    if (
      Date.parse(summary.startedAt) < pipelineStarted ||
      !network ||
      Date.parse(network.recordedAt) < pipelineStarted ||
      network.sdkSourceFingerprint !==
        summary.components.find((r) => r.id === 'sdk')?.sourceFingerprint ||
      summary.components.some((r) => !['passed', 'behavioural_failure'].includes(r.classification))
    )
      infrastructureError = true;
    let upstream, readiness;
    try {
      upstream = JSON.parse(readFileSync(join(root, 'evidence/runs/upstream-current.json')));
      readiness = JSON.parse(readFileSync(join(root, 'evidence/runs/readiness.json')));
    } catch {
      infrastructureError = true;
    }
    if (
      !upstream ||
      Date.parse(upstream.startedAt) < pipelineStarted ||
      !readiness ||
      Date.parse(readiness.recordedAt) < pipelineStarted
    )
      infrastructureError = true;
    let browser;
    try {
      browser = JSON.parse(readFileSync(join(root, 'evidence/runs/browser-observations.json')));
    } catch {
      infrastructureError = true;
    }
    if (!browser || Date.parse(browser.startedAt) < pipelineStarted) infrastructureError = true;
    if (!infrastructureError)
      await post(
        summaryText(summary, readiness) +
          ` HTTP: ${network.passed} pass / ${network.failed} fail. Upstream regressions: ${upstream.allPassed ? 'pass' : 'BLOCKED'}. Browser: ${readiness.browser?.allPassed ? 'pass (candidate + partial-repair controls)' : 'BLOCKED'}. Bundle ${readiness.bundleId}: ${readiness.reason}. Human review: ${readiness.approved ? 'recorded for this exact bundle' : 'pending'}.`,
        thread
      );
  }
  if (infrastructureError)
    await post(
      'The local pipeline could not produce a current complete result. No readiness or approval claimed. Inspect local evidence before retrying.',
      thread
    );
}
function stop(reason, failure = false) {
  stopped = true;
  clearTimeout(reconnectTimer);
  socket?.close();
  log('stopped', { reason });
  if (failure) process.exitCode = 1;
}
function connect() {
  if (stopped) return;
  const url = new URL(`/agents/${credentials.agentId}/connection/ws`, config.baseUrl);
  url.protocol = new URL(config.baseUrl).protocol === 'https:' ? 'wss:' : 'ws:';
  url.searchParams.set('connection_id', state.connectionId);
  url.searchParams.set('rooms', config.roomId);
  url.searchParams.set('scope', 'single');
  url.searchParams.set('filter', 'addressed');
  url.searchParams.set('start_from', state.cursor === null ? 'head' : String(state.cursor));
  url.searchParams.set('protocol', String(config.protocol));
  url.searchParams.set('protocol_accepts', String(config.protocol));
  url.searchParams.set('client', 'crossreporepair-verifier');
  url.searchParams.set('client_version', '0.1.0');
  if (state.generation !== null)
    url.searchParams.set('expected_generation', String(state.generation));
  socket = new WebSocket(url, {
    headers: { Authorization: `Bearer ${credentials.apiKey}` },
    maxPayload: 1024 * 1024,
  });
  socket.on('message', (raw) => {
    let frame;
    try {
      frame = JSON.parse(raw.toString());
    } catch {
      stop('invalid_frame', true);
      return;
    }
    const kind = frame.event || frame.type;
    const data = frame.data || frame;
    if (kind === 'ping') {
      socket.send(JSON.stringify({ type: 'pong', cursor: state.cursor ?? 0 }));
      writeFileSync(
        join(cache, 'verifier-heartbeat.json'),
        JSON.stringify({ at: new Date().toISOString(), roomId: config.roomId, pid: process.pid }) +
          '\n'
      );
      return;
    }
    if (kind === 'connection_state') {
      if (!acceptsConnectionState(data, config.roomId, config.protocol)) {
        stop('unexpected_connection_state', true);
        return;
      }
      state.cursor = data.cursor;
      state.generation = data.generation;
      save();
      log('connected', {
        roomId: config.roomId,
        serverProtocol: data.protocol,
        clientProtocol: config.protocol,
        server: data.server?.version,
      });
      if (!state.announced)
        queue = queue
          .then(async () => {
            await post(
              'Deterministic verifier online. The unmodified historical baseline has 4 SDK acceptance failures and 1 UI validation failure; a real loopback request also reproduces the SDK error. That is historical baseline evidence, not a claim about a later edited candidate. Mention this verifier with status or check. Review requires an explicitly enrolled sender and the full current bundle hash; no merge or deployment action exists.'
            );
            state.announced = true;
            save();
          })
          .catch((error) => log('announcement_failed', { error: error.message }));
      return;
    }
    if (kind === 'refused') {
      stop('connection_refused_' + data.status, true);
      return;
    }
    if (kind === 'gap') {
      stop('event_gap_requires_manual_resync', true);
      return;
    }
    if (kind === 'evicted') {
      if (data.code === 'taken_over' || data.code === 'closed') stop('evicted_' + data.code, true);
      return;
    }
    if (!['message', 'command', 'room_join'].includes(kind)) return;
    const sequence = frame.id ?? data.sequence;
    if (!Number.isSafeInteger(sequence)) {
      stop('unsafe_event_sequence', true);
      return;
    }
    if (sequence <= (state.cursor ?? -1)) return;
    if (++queued > 20) {
      stop('queue_limit_requires_manual_resync', true);
      return;
    }
    queue = queue
      .then(async () => {
        if (sequence <= (state.cursor ?? -1)) return;
        try {
          await handle(data);
        } catch (error) {
          log('request_failed', { error: error.message });
        }
        state.cursor = Math.max(state.cursor ?? 0, sequence);
        save();
      })
      .finally(() => {
        queued--;
      });
  });
  socket.on('error', (error) => log('socket_error', { error: error.message }));
  socket.on('close', (code) => {
    log('socket_closed', { code });
    if ([4400, 4401, 4403, 4409].includes(code)) stop('nonretryable_close_' + code, true);
    if (!stopped) reconnectTimer = setTimeout(connect, 2000);
  });
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => stop(signal));
process.on('exit', () => {
  if (existsSync(pidPath) && readFileSync(pidPath, 'utf8') === String(process.pid))
    unlinkSync(pidPath);
});
connect();
