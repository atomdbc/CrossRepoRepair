import { readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { runIsolatedProgram } from '../src/isolated-runtime.mjs';
import { digest } from '../src/verification.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const canaryDir = join(root, '.cache/isolation-host-canary');
mkdirSync(canaryDir, { recursive: true });
const hostFile = join(canaryDir, 'private.txt'),
  token = randomUUID();
writeFileSync(hostFile, token, { mode: 0o600 });
const protectedBytes = Buffer.from('canonical-read-only-canary\n');
const dependencyName = '.crossrepo-boundary-canary-' + randomUUID();
const dependencyFile = join(root, 'reference-repos/swagger-client/node_modules', dependencyName);
writeFileSync(dependencyFile, token, { flag: 'wx', mode: 0o666 });
let dependencyUnchanged = false;
const old = process.env.CROSSREPO_TEST_HOST_SECRET;
process.env.CROSSREPO_TEST_HOST_SECRET = token;
const program = `const fs=require('node:fs'),os=require('node:os'),net=require('node:net');
const results={uid:process.getuid(),node:process.version,hostEnvAbsent:process.env.CROSSREPO_TEST_HOST_SECRET===undefined,dockerSocketAbsent:!fs.existsSync('/var/run/docker.sock'),onlyLoopback:Object.values(os.networkInterfaces()).flat().every(i=>i.internal),capabilities:fs.readFileSync('/proc/self/status','utf8').match(/^CapEff:\\s*(.+)$/m)?.[1],noNewPrivileges:fs.readFileSync('/proc/self/status','utf8').includes('NoNewPrivs:\\t1')};
function denied(f){try{f();return false;}catch(e){return ['ENOENT','EACCES','EROFS','EPERM'].includes(e.code);}}
results.hostReadDenied=denied(()=>fs.readFileSync(${JSON.stringify(hostFile)}));
results.hostWriteDenied=denied(()=>fs.writeFileSync(${JSON.stringify(hostFile)},'changed'));
results.protectedTestWriteDenied=denied(()=>fs.appendFileSync('/work/test/isolation-canary.js','changed'));
results.sourceWriteDenied=denied(()=>fs.writeFileSync('/work/src/unauthorised-canary.js','changed'));
results.protectedTestChmodDenied=denied(()=>fs.chmodSync('/work/test/isolation-canary.js',0o644));
results.dependencyWriteDenied=denied(()=>fs.appendFileSync('/work/node_modules/'+${JSON.stringify(dependencyName)},'changed'));
results.readOnlyMounts=['/work','/work/node_modules','/runner.cjs'].every(path=>fs.readFileSync('/proc/self/mountinfo','utf8').split('\\n').some(line=>{const p=line.split(' ');return p[4]===path&&p[5].split(',').includes('ro')}));
results.rootWriteDenied=denied(()=>fs.writeFileSync('/etc/unauthorised-canary','changed'));
fs.writeFileSync('/tmp/scratch-canary','ok');results.scratchWritable=fs.readFileSync('/tmp/scratch-canary','utf8')==='ok';
const socket=net.connect({host:'203.0.113.1',port:9});let done=false;function finish(blocked){if(done)return;done=true;socket.destroy();results.networkAttemptBlocked=blocked;console.log(JSON.stringify(results));}
socket.on('connect',()=>finish(false));socket.on('error',()=>finish(true));socket.setTimeout(1000,()=>finish(true));`;
let result;
try {
  result = runIsolatedProgram(root, 'sdk', program, {
    canonical: protectedBytes,
    testDestination: 'test/isolation-canary.js',
    dependencies: true,
    timeout: 30000,
  });
} finally {
  dependencyUnchanged = readFileSync(dependencyFile, 'utf8') === token;
  unlinkSync(dependencyFile);
  if (old === undefined) delete process.env.CROSSREPO_TEST_HOST_SECRET;
  else process.env.CROSSREPO_TEST_HOST_SECRET = old;
}
const observations = JSON.parse(result.child.stdout || 'null');
const passed =
  result.child.status === 0 &&
  observations?.uid !== 0 &&
  observations?.capabilities === '0000000000000000' &&
  Object.entries(observations)
    .filter(([k]) => !['uid', 'node', 'capabilities'].includes(k))
    .every(([, v]) => v === true) &&
  readFileSync(hostFile, 'utf8') === token &&
  dependencyUnchanged;
const report = {
  probeHash: digest(readFileSync(fileURLToPath(import.meta.url))),
  dependencyCanaryUnchanged: dependencyUnchanged,
  recordedAt: new Date().toISOString(),
  passed,
  observations,
  isolation: result.isolation,
  hostCanaryUnchanged: digest(readFileSync(hostFile)) === digest(token),
  scope:
    'Actual source/checker-container boundary probe, no real credential used; not full repair-worker/build/browser isolation or malicious-test correctness proof.',
};
mkdirSync(join(root, 'evidence/runs'), { recursive: true });
writeFileSync(
  join(root, 'evidence/runs/isolation-probe.json'),
  JSON.stringify(report, null, 2) + '\n'
);
console.log(JSON.stringify(report, null, 2));
process.exitCode = passed ? 0 : 1;
