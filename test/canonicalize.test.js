import test from 'node:test';
import assert from 'node:assert/strict';

import { canonicalize, canonicalBytes, isCanonical, DEFAULT_MAX_DEPTH } from '../src/index.js';

test('键按 UTF-16 code unit 升序，与插入顺序无关', () => {
  assert.equal(canonicalize({ b: 1, a: 2 }), '{"a":2,"b":1}');
  assert.equal(canonicalize({ a: 2, b: 1 }), '{"a":2,"b":1}');

  // 大写在小写之前（code unit 序，不是语言环境序）
  assert.equal(canonicalize({ a: 1, A: 2 }), '{"A":2,"a":1}');
  // 非 ASCII：仍按 code unit 序（'é' = U+00E9 在 'z' = U+007A 之后）
  assert.equal(canonicalize({ é: 1, z: 2 }), '{"z":2,"é":1}');
});

test('同一个值、不同的构造顺序 ⇒ 逐字节相同', () => {
  const a = { name: 'x', deps: [{ ref: 'v1', name: 'a' }], meta: { z: 1, a: 2 } };
  const b = { meta: { a: 2, z: 1 }, deps: [{ name: 'a', ref: 'v1' }], name: 'x' };
  assert.equal(canonicalize(a), canonicalize(b));
  assert.equal(canonicalize(a), '{"deps":[{"name":"a","ref":"v1"}],"meta":{"a":2,"z":1},"name":"x"}');
});

test('标量：null / 布尔 / 数字 / 字符串', () => {
  assert.equal(canonicalize(null), 'null');
  assert.equal(canonicalize(true), 'true');
  assert.equal(canonicalize(false), 'false');
  assert.equal(canonicalize(0), '0');
  assert.equal(canonicalize(-0), '0'); // ECMAScript 的 JSON.stringify 同款
  assert.equal(canonicalize(0.1), '0.1');
  assert.equal(canonicalize(1e21), '1e+21');
  assert.equal(canonicalize(-1.5e-7), '-1.5e-7');
  assert.equal(canonicalize('hi'), '"hi"');
  assert.equal(canonicalize('a"b\\c\n'), '"a\\"b\\\\c\\n"');
  // 非 ASCII 不转义（UTF-8 落字节时是确定的多字节序列）
  assert.equal(canonicalize('中文'), '"中文"');
});

test('数组与嵌套；空容器', () => {
  assert.equal(canonicalize([]), '[]');
  assert.equal(canonicalize({}), '{}');
  assert.equal(canonicalize([1, [2, [3]]]), '[1,[2,[3]]]');
  assert.equal(canonicalize({ b: [true, null], a: {} }), '{"a":{},"b":[true,null]}');
});

test('null 原型的对象也是普通对象', () => {
  const o = Object.create(null);
  o.b = 1;
  o.a = 2;
  assert.equal(canonicalize(o), '{"a":2,"b":1}');
});

test('输出没有多余空白，且是 UTF-8 可编码的', () => {
  const s = canonicalize({ a: [1, 2], b: 'x y' });
  assert.equal(s, '{"a":[1,2],"b":"x y"}');
  assert.equal(new TextDecoder().decode(canonicalBytes({ a: [1, 2], b: 'x y' })), s);
  // 注意：这是 JSON 字符串的字节，**含两端的引号**（U+22）
  assert.deepEqual([...canonicalBytes('中')], [0x22, 0xe4, 0xb8, 0xad, 0x22]);
});

test('isCanonical：规范串为真；重排版过 / 非法 JSON 为假', () => {
  assert.equal(isCanonical('{"a":1}'), true);
  assert.equal(isCanonical('{"a":1,"b":2}'), true);
  assert.equal(isCanonical('{"b":2,"a":1}'), false); // 键序不对
  assert.equal(isCanonical('{ "a": 1 }'), false); // 有多余空白
  assert.equal(isCanonical('{"a":1}\n'), false); // 尾随换行
  assert.equal(isCanonical('{"a":2,"a":1}'), false); // 重复键（解析后只剩一个）
  assert.equal(isCanonical('not json'), false);
  assert.equal(isCanonical(42), false); // 非字符串不抛，返回 false
});

test('深度上限：默认值内可用，超限报 TOO_DEEP 而不是栈溢出', () => {
  // 造一个深度正好 maxDepth 的值：每层是一层数组
  const depth = (n) => {
    let v = 0;
    for (let i = 0; i < n; i++) v = [v];
    return v;
  };
  assert.doesNotThrow(() => canonicalize(depth(DEFAULT_MAX_DEPTH - 1)));
  // `assert.throws` 不返回错误对象，因此自己捕获后再看 code
  let err = null;
  try {
    canonicalize(depth(DEFAULT_MAX_DEPTH + 1));
  } catch (e) {
    err = e;
  }
  assert.ok(err, '超过 maxDepth 必须报错，而不是栈溢出');
  assert.equal(err.code, 'TOO_DEEP');
  assert.match(err.message, /maxDepth/);

  // maxDepth 可调，且非法值本身要报错
  assert.equal(canonicalize(depth(3), { maxDepth: 10 }), '[[[0]]]');
  assert.throws(() => canonicalize(1, { maxDepth: 0 }), /maxDepth must be a positive integer/);
});
