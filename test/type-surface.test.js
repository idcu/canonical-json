import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as api from '../src/index.js';

// 这一组守两件事，都属"静默失效"类：
//   1. 类型面（index.d.ts）与实现的导出名**双向**对账——只有一边有的名字，就是漂移；
//   2. package.json 的入口（exports/types）必须指向**真实存在**的文件——
//      这条正是 ngm 对依赖的要求（入口指向空气 = vendored 之后是坏的）。

const repoRoot = fileURLToPath(new URL('..', import.meta.url)); // 本仓库根
const src = new URL('../src/', import.meta.url);
const pkg = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));

const matchNames = (text, re) => [...text.matchAll(re)].map((m) => m[1]).sort();

test('运行时导出名与 index.d.ts 的声明逐一对账', () => {
  const dts = readFileSync(fileURLToPath(new URL('index.d.ts', src)), 'utf8');

  const runtime = Object.keys(api).sort();
  const declared = matchNames(dts, /^export declare (?:function|const|class)\s+([A-Za-z_$][\w$]*)/gm);
  const typeOnly = matchNames(dts, /^export (?:type|interface)\s+([A-Za-z_$][\w$]*)/gm);

  assert.deepEqual(
    runtime,
    declared,
    `运行时导出与类型面不一致\n  运行时: ${runtime.join(', ')}\n  类型面: ${declared.join(', ')}`,
  );
  for (const t of typeOnly) {
    assert.ok(!runtime.includes(t), `类型名 ${t} 不该是运行时导出（type/interface 在运行时不存在）`);
  }
  assert.ok(runtime.length >= 4, '导出面缩到 4 个以下——先确认实现没被改坏');
});

test('package.json 的 exports / types 指向真实文件', () => {
  const entry = pkg.exports['.'];
  assert.ok(entry, 'package.json 必须有 exports["."]');
  assert.equal(entry.types, './src/index.d.ts');
  assert.equal(entry.default, './src/index.js');
  for (const rel of [entry.types, entry.default]) {
    const abs = path.join(repoRoot, rel);
    assert.ok(existsSync(abs), `${rel} 不存在（解析为 ${abs}）——入口指向空气`);
  }
  assert.equal(pkg.type, 'module', 'ESM 优先：type 必须是 module');
  assert.ok(pkg.engines?.node, 'engines.node 必须声明');
  assert.ok(pkg.files?.length, 'files 必须声明发布范围');
  assert.ok(!pkg.scripts?.postinstall && !pkg.scripts?.prepare, '不许有安装期钩子（依赖方默认不执行）');
});

test('ngm.json（若有）带齐 name / version / runtime', () => {
  const ngmPath = fileURLToPath(new URL('../ngm.json', import.meta.url));
  if (!existsSync(ngmPath)) return; // 可选文件
  const ngm = JSON.parse(readFileSync(ngmPath, 'utf8'));
  assert.equal(typeof ngm.name, 'string');
  assert.equal(typeof ngm.version, 'string');
  assert.ok(['node', 'deno'].includes(ngm.runtime), 'ngm.json 的 runtime 必须是 node 或 deno');
  assert.equal(ngm.main, './src/index.js');
  assert.equal(ngm.types, './src/index.d.ts');
});
