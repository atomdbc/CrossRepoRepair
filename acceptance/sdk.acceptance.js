// Original acceptance cases for this replay; not copied from benchmark tests.
// Installed temporarily into the pinned SDK's test directory by our runner.
import { buildRequest } from '../src/execute/index.js';

function queryValues(schema, value) {
  const request = buildRequest({
    spec: {
      openapi: '3.1.0',
      info: { title: 'Local array contract', version: '1.0.0' },
      paths: {
        '/echo': {
          get: {
            operationId: 'echo',
            parameters: [{ name: 'parameters', in: 'query', style: 'form', explode: true, schema }],
            responses: { 200: { description: 'Echo query' } },
          },
        },
      },
    },
    operationId: 'echo',
    parameters: { parameters: value },
  });
  // This tests the actual builder output, not a captured HTTP exchange.
  return new URL(request.url, 'http://127.0.0.1').searchParams.getAll('parameters');
}

const array = { type: 'array', items: { type: 'string' } };
const nil = { type: 'null' };

describe('CrossRepoRepair independent SDK acceptance', () => {
  test.each([
    ['B01 union', { type: ['array', 'null'], items: { type: 'string' } }],
    ['B02 anyOf', { anyOf: [array, nil] }],
    ['B02 oneOf', { oneOf: [array, nil] }],
    ['B02 nested', { anyOf: [{ oneOf: [array, nil] }, nil] }],
  ])('%s decodes an array representation before form/explode serialization', (_name, schema) => {
    expect(queryValues(schema, '["a","b"]')).toEqual(['a', 'b']);
  });

  test('B03 preserves an ordinary string under a string-only schema', () => {
    expect(queryValues({ type: 'string' }, 'alpha')).toEqual(['alpha']);
  });

  test('B04 preserves a JSON-looking string under a string-only schema', () => {
    expect(queryValues({ type: 'string' }, '["a","b"]')).toEqual(['["a","b"]']);
  });

  test('regression: an already-typed array is still serialized correctly', () => {
    expect(queryValues(array, ['a', 'b'])).toEqual(['a', 'b']);
  });
});
