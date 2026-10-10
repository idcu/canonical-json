import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import { canonicalize, canonicalBytes, canonicalHash } from '../src/index.js';

// 哈希这一组做两件事：
//   1. 与 `node:crypto` 的独立实现**逐字节对账**（WebCrypto 实现不自己说了算）；
//   2. 钉一个已知向量（跨机器、跨时间都不许变）。

test('canonicalHash 与 node:crypto 的 sha256 一致', async () => {
  const cases = [
    { a: 1, b: [2, 3] },
    { z: null, a: '中', m: -0 },
    [[], {}, ''],
    { nested: { deep: { value: 0.1 } } },
  ];
  for (const value of cases) {
    const bytes = canonicalBytes(value);
    const expected = createHash('sha256').update(bytes).digest('hex');
    assert.equal(await canonicalHash(value), expected, `mismatch for ${canonicalize(value)}`);
  }
});

test('已知向量：同一份数据在任何机器上都必须得到同一个摘要', async () => {
  assert.equal(canonicalize({ b: [2, 3], a: 1 }), '{"a":1,"b":[2,3]}');
  // 这个值由两个独立实现交叉确认过：本库的 WebCrypto 路径，
  // 以及 `printf %s '{"a":1,"b":[2,3]}' | sha256sum`（coreutils）。
  assert.equal(
    await canonicalHash({ b: [2, 3], a: 1 }),
    'efbd0040190fb0871831e606c581f8a66db79d8e2bb836745a70051306956070',
  );
});

test('键序不同的同一个值 ⇒ 同一个摘要', async () => {
  const a = await canonicalHash({ x: 1, y: 2 });
  const b = await canonicalHash({ y: 2, x: 1 });
  assert.equal(a, b);
  assert.equal(a.length, 64);
  assert.match(a, /^[0-9a-f]{64}$/);
});

test('一个字节的差别 ⇒ 不同的摘要', async () => {
  assert.notEqual(await canonicalHash({ a: 1 }), await canonicalHash({ a: '1' }));
  assert.notEqual(await canonicalHash({ a: 1 }), await canonicalHash({ A: 1 }));
});

test('缺 WebCrypto 时明确报错，而不是换一个实现', async () => {
  const saved = globalThis.crypto;
  try {
    // 模拟没有 WebCrypto 的运行时
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });
    const err = await canonicalHash({ a: 1 }).then(
      () => null,
      (e) => e,
    );
    assert.ok(err, 'expected canonicalHash to reject without WebCrypto');
    assert.equal(err.code, 'NO_WEBCRYPTO');
    assert.match(err.message, /WebCrypto is required/);
  } finally {
    Object.defineProperty(globalThis, 'crypto', { value: saved, configurable: true });
  }
});
