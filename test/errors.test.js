import test from 'node:test';
import assert from 'node:assert/strict';

import { canonicalize, CanonicalJsonError, ERROR_CODES } from '../src/index.js';

// 这一组守的是"**报错而不是改写**"：凡 JSON 表达不了的值，都必须带着
// 位置（path）与错误码（code）抛出来——静默丢弃是这类库最坏的失败形态。

// 注意：`assert.throws` 返回 undefined（它只负责断言），因此这里自己捕获，
// 再把"抛了什么"逐字段核对——错误对象本身就是契约的一部分。
const capture = (fn) => {
  try {
    fn();
  } catch (e) {
    return e;
  }
  return null;
};

const rejects = (value, code, path) => {
  const err = capture(() => canonicalize(value));
  assert.ok(err, `expected a throw for ${String(value)}`);
  assert.ok(err instanceof CanonicalJsonError, `expected CanonicalJsonError, got ${err.name}`);
  assert.ok(err instanceof Error);
  assert.equal(err.name, 'CanonicalJsonError');
  assert.equal(err.code, code);
  assert.equal(err.path, path);
  return err;
};

test('undefined（对象里的键）', () => {
  const err = rejects({ a: undefined }, ERROR_CODES.UNDEFINED, '$.a');
  assert.match(err.message, /undefined cannot be represented/);
  assert.match(err.message, /omit the key/);
});

test('undefined（数组元素）', () => {
  rejects([1, undefined], ERROR_CODES.NOT_JSON, '$[1]');
});

test('函数 / Symbol / BigInt', () => {
  rejects(() => {}, ERROR_CODES.NOT_JSON, '$');
  rejects(Symbol('s'), ERROR_CODES.NOT_JSON, '$');
  rejects(10n, ERROR_CODES.NOT_JSON, '$');
});

test('NaN / ±Infinity', () => {
  rejects(NaN, ERROR_CODES.NON_FINITE_NUMBER, '$');
  rejects({ x: [Infinity] }, ERROR_CODES.NON_FINITE_NUMBER, '$.x[0]');
  rejects(-Infinity, ERROR_CODES.NON_FINITE_NUMBER, '$');
});

test('非普通对象：Date / Map / 类实例（不调用 toJSON）', () => {
  rejects({ when: new Date(0) }, ERROR_CODES.NOT_PLAIN_OBJECT, '$.when');
  rejects(new Map(), ERROR_CODES.NOT_PLAIN_OBJECT, '$');
  class Point {
    constructor() {
      this.x = 1;
    }
  }
  const err = rejects({ p: new Point() }, ERROR_CODES.NOT_PLAIN_OBJECT, '$.p');
  assert.match(err.message, /Point/);
  assert.match(err.message, /toJSON\(\) is deliberately not called/);
});

test('循环引用（含自引用数组）', () => {
  const o = { a: {} };
  o.a.back = o;
  const err = rejects(o, ERROR_CODES.CYCLE, '$.a.back');
  assert.match(err.message, /circular reference/);

  const arr = [];
  arr.push(arr);
  rejects(arr, ERROR_CODES.CYCLE, '$[0]');
});

test('错误位置是 JSON 指针风格，能一路指到深处', () => {
  rejects({ list: [{ ok: 1 }, { bad: NaN }] }, ERROR_CODES.NON_FINITE_NUMBER, '$.list[1].bad');
});

test('同一个值被复用（非循环）不算循环', () => {
  const shared = { x: 1 };
  assert.equal(canonicalize({ a: shared, b: shared }), '{"a":{"x":1},"b":{"x":1}}');
});

test('ERROR_CODES 是冻结的常量表', () => {
  assert.ok(Object.isFrozen(ERROR_CODES));
  assert.equal(ERROR_CODES.TOO_DEEP, 'TOO_DEEP');
});
