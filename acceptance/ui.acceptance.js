// Original acceptance cases. This is a validation-function check, not a browser test.
import { fromJS } from 'immutable';
import { validateParam } from 'core/utils';

const arrayParam = fromJS({
  name: 'parameters',
  in: 'query',
  required: true,
  schema: { type: 'array', items: { type: 'string' } },
});
const options = { isOAS3: true };

describe('CrossRepoRepair independent UI acceptance', () => {
  test('B05 rejects a non-array string under an array-only schema', () => {
    expect(validateParam(arrayParam, 'not-an-array', options).length).toBeGreaterThan(0);
  });

  test('B06 retains the missing-required-array error', () => {
    expect(validateParam(arrayParam, undefined, options)).toContain('Required field is not provided');
  });

  test('regression: accepts a valid Immutable array value', () => {
    expect(validateParam(arrayParam, fromJS(['a', 'b']), options)).toEqual([]);
  });

  test('regression: preserves required validation for an empty string', () => {
    expect(validateParam(arrayParam, '', options)).toContain('Required field is not provided');
  });

  test('B04 does not reject a JSON-looking string under a string-only schema', () => {
    const param = fromJS({ name: 'parameters', in: 'query', required: true, schema: { type: 'string' } });
    expect(validateParam(param, '["a","b"]', options)).toEqual([]);
  });
});
