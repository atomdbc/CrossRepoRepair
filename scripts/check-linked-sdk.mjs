import { createServer } from 'node:http';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, realpathSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { digest, fingerprintRepository } from '../src/verification.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const binding = JSON.parse(readFileSync(join(root, 'evidence/runs/sdk-artifact-binding.json')));
const config = JSON.parse(readFileSync(join(root, 'case.json')));
const sdk = join(root, config.repositories.find(r => r.id === 'sdk').directory);
const ui = join(root, config.repositories.find(r => r.id === 'ui').directory);
if (binding.sourceFingerprint !== fingerprintRepository(sdk)) throw new Error('SDK source changed; rebuild/rebind the artifact.');
if (binding.artifactHash !== digest(readFileSync(join(root, binding.archive)))) throw new Error('Artifact hash changed.');
const requireUI = createRequire(join(ui, 'package.json'));
const loadedPackage = requireUI.resolve('swagger-client/package.json');
if (realpathSync(loadedPackage) !== realpathSync(join(root, binding.resolvedPackage))) throw new Error('Wrong SDK dependency resolved.');
if (digest(readFileSync(join(dirname(loadedPackage), 'lib/execute/index.js'))) !== binding.commonjsExecuteHash) throw new Error('Artifact execution content changed.');
const SwaggerClient = requireUI('swagger-client');
const observed = [];
const server = createServer((request, response) => {
  const values = new URL(request.url, 'http://127.0.0.1').searchParams.getAll('parameters');
  observed.push({ method: request.method, rawUrl: request.url, values });
  response.writeHead(200, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify({ values }));
});
server.keepAliveTimeout = 50;
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const address = server.address();
const cases = [
  { id: 'B01 real HTTP encoded union array', schema: { type: ['array', 'null'], items: { type: 'string' } }, value: '["a","b"]', expected: ['a', 'b'] },
  { id: 'regression real HTTP typed array', schema: { type: 'array', items: { type: 'string' } }, value: ['a', 'b'], expected: ['a', 'b'] },
  { id: 'B04 real HTTP string-only JSON-looking input', schema: { type: 'string' }, value: '["a","b"]', expected: ['["a","b"]'] },
];
const results = [];
try {
  for (const item of cases) {
    const spec = {
      openapi: '3.1.0', info: { title: 'Local synthetic echo', version: '1.0.0' },
      servers: [{ url: `http://127.0.0.1:${address.port}` }],
      paths: { '/echo': { get: { operationId: 'echo',
        parameters: [{ name: 'parameters', in: 'query', style: 'form', explode: true, schema: item.schema }],
        responses: { 200: { description: 'Echo received query values' } },
      } } },
    };
    const beforeRequests = observed.length;
    const response = await SwaggerClient.execute({ spec, operationId: 'echo', parameters: { parameters: item.value } });
    if (observed.length !== beforeRequests + 1) throw new Error('Expected one actual captured request.');
    const actual = response.obj.values;
    results.push({ id: item.id, expected: item.expected, actual, passed: isDeepStrictEqual(actual, item.expected), request: observed.at(-1) });
  }
} finally {
  await new Promise((resolve) => server.close(resolve));
}
if (binding.sourceFingerprint !== fingerprintRepository(sdk)) throw new Error('Source changed during network checks.');
const failed = results.filter(r => !r.passed).length;
const expectFailure = process.argv.includes('--expect-failure');
const baselineReproduced = expectFailure && results.length === 3 && !results[0].passed && results.slice(1).every(r => r.passed);
const report = {
  recordedAt: new Date().toISOString(), coverage: 'Actual loopback HTTP requests through the SDK artifact resolved from the UI dependency path. Not a browser UI or live Switch agent run.',
  artifactHash: binding.artifactHash, sdkSourceFingerprint: binding.sourceFingerprint,
  resolvedPackage: binding.resolvedPackage, passed: results.length - failed, failed,
  acceptancePassed: failed === 0, baselineReproduced, results,
};
writeFileSync(join(root, 'evidence/runs/linked-sdk-http.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
process.exitCode = expectFailure ? (baselineReproduced ? 0 : 1) : (failed === 0 ? 0 : 1);
