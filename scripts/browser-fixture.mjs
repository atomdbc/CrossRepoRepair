import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export async function startFixture() {
  const requests = [];
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname === '/echo') {
      const values = url.searchParams.getAll('parameters');
      requests.push({ method: req.method, rawUrl: req.url, values });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ values }));
      return;
    }
    if (url.pathname === '/ui.js') {
      const variant = url.searchParams.get('variant');
      if (!['neither-fixed', 'sdk-only', 'ui-only', 'both-fixed'].includes(variant)) {
        res.writeHead(400);
        res.end();
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/javascript' });
      res.end(readFileSync(join(root, '.cache/browser', variant, 'swagger-ui.js')));
      return;
    }
    if (url.pathname === '/ui.css') {
      res.writeHead(200, { 'Content-Type': 'text/css' });
      res.end(readFileSync(join(root, '.cache/browser/swagger-ui.css')));
      return;
    }
    if (url.pathname !== '/') {
      res.writeHead(404);
      res.end();
      return;
    }
    const variant = url.searchParams.get('variant'),
      mode = url.searchParams.get('mode');
    if (
      !['neither-fixed', 'sdk-only', 'ui-only', 'both-fixed'].includes(variant) ||
      !['invalid-array', 'missing-array', 'typed-array', 'encoded-union', 'string-only'].includes(
        mode
      )
    ) {
      res.writeHead(400);
      res.end();
      return;
    }
    const value =
      mode === 'invalid-array'
        ? 'not-an-array'
        : mode === 'missing-array'
          ? []
          : mode === 'typed-array'
            ? ['a', 'b']
            : '["a","b"]';
    const schema =
      mode === 'string-only'
        ? { type: 'string' }
        : {
            type: mode === 'encoded-union' ? ['array', 'null'] : 'array',
            items: { type: 'string' },
          };
    const spec = {
      openapi: '3.1.0',
      info: { title: 'CrossRepoRepair browser fixture', version: '1.0.0' },
      paths: {
        '/echo': {
          get: {
            operationId: 'echo',
            parameters: [
              {
                name: 'parameters',
                in: 'query',
                required: true,
                style: 'form',
                explode: true,
                schema: { ...schema, example: value },
                example: value,
              },
            ],
            responses: { 200: { description: 'Local echo' } },
          },
        },
      },
    };
    res.writeHead(200, {
      'Content-Type': 'text/html',
      'Content-Security-Policy':
        "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob:; connect-src 'self'; img-src 'self' data:;",
    });
    res.end(
      `<!doctype html><html lang="en"><meta charset="utf-8"><title>CrossRepoRepair browser regression</title><link rel="stylesheet" href="/ui.css"><div id="swagger-ui"></div><script src="/ui.js?variant=${variant}"></script><script>window.fixture={variant:${JSON.stringify(variant)},mode:${JSON.stringify(mode)}};window.ui=SwaggerUIBundle({spec:${JSON.stringify(spec)},dom_id:'#swagger-ui',validatorUrl:null,tryItOutEnabled:true,docExpansion:'full',defaultModelsExpandDepth:-1});</script></html>`
    );
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return { server, requests, baseUrl: `http://127.0.0.1:${server.address().port}` };
}
